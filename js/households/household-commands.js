/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD COMMANDS (household-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-commands.js
 * 
 * All write operations for household management.
 * 
 * UPDATED: Fixed _getState().updateHousehold is not a function error
 *          All state updates now use HouseholdState._setHouseholds() directly
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

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
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

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _invalidateCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        var state = _getState();
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    function _getResidenceSystem() {
        return typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _addProfession(characterId, roleId, options) {
        if (typeof window.addProfession === 'function') {
            return window.addProfession(characterId, roleId, options);
        }
        return { success: false };
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processingCommand = false;
    var _recordingHistory = false;

    // =========================================================================
    // 3. INTERNAL HELPERS
    // =========================================================================

    function _addActivityLog(householdId, action, details, actorId) {
        var state = _getState();
        if (!state) return false;
        
        var household = state.getHousehold(householdId);
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
        
        if (household.activityLog.length > 100) {
            household.activityLog = household.activityLog.slice(-100);
        }
        
        // Save changes using _setHouseholds
        var households = state.getAllHouseholds({ includeDeprecated: true });
        var index = -1;
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            households[index] = household;
            state._setHouseholds(households);
        }
        
        return true;
    }

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
            var state = _getState();
            var household = householdId ? state.getHousehold(householdId) : null;
            var householdName = household ? household.name : (options.previousHouseholdName || null);
            
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
                
                if (character.household === previousHouseholdId) {
                    character.household = '';
                    character.householdId = '';
                }
                
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
                
                character.household = householdId || '';
                character.householdId = householdId || '';
            }
            
            character.householdHistory.sort(function(a, b) {
                return (a.joinedYear || 0) - (b.joinedYear || 0);
            });
            
            _saveMasterData();
            return true;
            
        } finally {
            _recordingHistory = false;
        }
    }

    function _validateMemberAddition(householdId, characterId, type) {
        var state = _getState();
        if (!state) {
            return { valid: false, reason: 'Household state not available' };
        }
        
        var household = state.getHousehold(householdId);
        if (!household) {
            return { valid: false, reason: 'Household not found' };
        }
        
        var character = _getCharacterById(characterId);
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }
        
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

    function _updateHouseholdStatus(householdId) {
        var state = _getState();
        if (!state) return;
        
        var household = state.getHousehold(householdId);
        if (!household) return;
        
        var statusInfo = state.getHouseholdStatus(householdId);
        if (statusInfo && statusInfo.status !== household.status) {
            // Use direct mutation
            household.status = statusInfo.status;
            
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }
        }
    }

    function _validatePositionCreation(householdId, name, requiredRoleId) {
        var state = _getState();
        if (!state) {
            return { valid: false, reason: 'Household state not available' };
        }
        
        var household = state.getHousehold(householdId);
        if (!household) {
            return { valid: false, reason: 'Household not found' };
        }

        if (!name || name.trim() === '') {
            return { valid: false, reason: 'Position name is required' };
        }

        if (requiredRoleId) {
            var role = _getRoleById(requiredRoleId);
            if (!role) {
                return { valid: false, reason: 'Required role not found' };
            }
        }

        return { valid: true, reason: '' };
    }

    // =========================================================================
    // 4. MEMBER MANAGEMENT
    // =========================================================================

    function addMember(householdId, characterId, type, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            
            var validation = _validateMemberAddition(householdId, characterId, type);
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }
            
            var household = state.getHousehold(householdId);
            var character = _getCharacterById(characterId);
            var joinedYear = options.joinedYear || _getCurrentYear();
            var role = options.role || (type === 'family' ? 'Family Member' : 'Staff');
            var isHead = options.isHead || false;
            
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
            
            if (!household.members) {
                household.members = [];
            }
            household.members.push(member);
            
            // Save using _setHouseholds
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) {
                return { success: false, reason: 'Household not found in list' };
            }
            households[index] = household;
            state._setHouseholds(households);
            
            if (isHead) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId !== characterId && household.members[i].isHead) {
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                    }
                }
                // Save again if head changed
                households = state.getAllHouseholds({ includeDeprecated: true });
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        households[i] = household;
                        break;
                    }
                }
                state._setHouseholds(households);
            }
            
            if (options.recordHistory !== false) {
                _recordCharacterHouseholdChange(characterId, householdId, joinedYear, 'joined',
                    options.notes || 'Added to household as ' + type + (role ? ' (' + role + ')' : ''),
                    { newRole: role, isHead: isHead });
            }
            
            if (character) {
                character.household = householdId;
                character.householdId = householdId;
                _saveMasterData();
            }
            
            _addActivityLog(householdId, 'member_added',
                (character.name || 'Unknown') + ' added as ' + type + (role ? ' (' + role + ')' : ''),
                characterId);
            
            _logEvent('household', 'Member Added',
                (character.name || 'Unknown') + ' added to ' + household.name + ' as ' + type,
                [character]);
            
            _updateHouseholdStatus(householdId);
            
            _invalidateCaches();
            
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

    function removeMember(householdId, characterId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            
            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            
            var leftYear = options.leftYear || _getCurrentYear();
            var reason = options.reason || 'Removed';
            
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
            
            var wasHead = member.isHead;
            
            household.members.splice(memberIndex, 1);
            
            // Save using _setHouseholds
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) {
                return { success: false, reason: 'Household not found in list' };
            }
            households[index] = household;
            state._setHouseholds(households);
            
            if (options.recordHistory !== false) {
                _recordCharacterHouseholdChange(characterId, null, leftYear, 'left',
                    reason || 'Left ' + household.name,
                    { previousHouseholdId: householdId, previousHouseholdName: household.name });
            }
            
            if (character.household === householdId) {
                character.household = '';
                character.householdId = '';
                _saveMasterData();
            }
            
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
            
            _addActivityLog(householdId, 'member_removed',
                (character.name || 'Unknown') + ' removed (' + reason + ')',
                characterId);
            
            _logEvent('household', 'Member Removed',
                (character.name || 'Unknown') + ' removed from ' + household.name,
                [character]);
            
            _updateHouseholdStatus(householdId);
            
            _invalidateCaches();
            
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

    function updateMember(householdId, characterId, updates, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            
            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
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
            
            if (!member) {
                return { success: false, reason: 'Character is not a member' };
            }
            
            var oldRole = member.role;
            var oldType = member.type;
            var oldIsHead = member.isHead;
            
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
            
            // Save using _setHouseholds
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) {
                return { success: false, reason: 'Household not found in list' };
            }
            households[index] = household;
            state._setHouseholds(households);
            
            if (member.isHead && !oldIsHead) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId !== characterId && household.members[i].isHead) {
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                    }
                }
                // Save again if head changed
                households = state.getAllHouseholds({ includeDeprecated: true });
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        households[i] = household;
                        break;
                    }
                }
                state._setHouseholds(households);
            }
            
            if (options.recordHistory !== false && member.role !== oldRole) {
                _recordCharacterHouseholdChange(characterId, householdId, _getCurrentYear(), 'transferred',
                    'Role changed from ' + oldRole + ' to ' + member.role,
                    { newRole: member.role });
            }
            
            var details = [];
            if (member.role !== oldRole) details.push('role: ' + oldRole + ' → ' + member.role);
            if (member.type !== oldType) details.push('type: ' + oldType + ' → ' + member.type);
            if (member.isHead !== oldIsHead) details.push('head: ' + (oldIsHead ? 'yes' : 'no') + ' → ' + (member.isHead ? 'yes' : 'no'));
            
            _addActivityLog(householdId, 'member_updated',
                (character.name || 'Unknown') + ' updated: ' + details.join(', '),
                characterId);
            
            _updateHouseholdStatus(householdId);
            
            _invalidateCaches();
            
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

    function transferMember(characterId, targetHouseholdId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            
            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            
            if (character.isDeceased) {
                return { success: false, reason: 'Cannot transfer deceased character' };
            }
            
            var targetHousehold = state.getHousehold(targetHouseholdId);
            if (!targetHousehold) {
                return { success: false, reason: 'Target household not found' };
            }
            
            var currentHousehold = state.getCharacterHousehold(characterId);
            var year = options.year || _getCurrentYear();
            var reason = options.reason || 'Transferred';
            
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
            
            if (currentHousehold) {
                _addActivityLog(currentHousehold.id, 'member_transferred_out',
                    (character.name || 'Unknown') + ' transferred to ' + targetHousehold.name + ': ' + reason,
                    characterId);
            }
            
            _addActivityLog(targetHouseholdId, 'member_transferred_in',
                (character.name || 'Unknown') + ' transferred from ' + (currentHousehold ? currentHousehold.name : 'None') + ': ' + reason,
                characterId);
            
            _logEvent('household', 'Member Transferred',
                (character.name || 'Unknown') + ' transferred from ' + (currentHousehold ? currentHousehold.name : 'None') + ' to ' + targetHousehold.name,
                [character]);
            
            _invalidateCaches();
            
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
    // 5. HEAD OF HOUSEHOLD MANAGEMENT
    // =========================================================================

    function setHead(householdId, characterId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            
            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            var year = options.year || _getCurrentYear();
            var reason = options.reason || 'Succession';
            
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
                
                var households = state.getAllHouseholds({ includeDeprecated: true });
                var index = -1;
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        index = i;
                        break;
                    }
                }
                if (index !== -1) {
                    households[index] = household;
                    state._setHouseholds(households);
                }
                
                if (oldHead) {
                    _recordCharacterHouseholdChange(oldHead.characterId, householdId, year, 'transferred',
                        'Stepped down as head of household',
                        { newRole: 'Family Member' });
                }
                
                _addActivityLog(householdId, 'head_removed', 'Head of household removed');
                
                return { success: true, oldHead: oldHead };
            }
            
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
            
            var oldHead = null;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].isHead) {
                    oldHead = household.members[i];
                    household.members[i].isHead = false;
                    household.members[i].headSince = null;
                    household.members[i].role = 'Family Member';
                }
            }
            
            member.isHead = true;
            member.role = 'Head of Household';
            member.headSince = year;
            
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }
            
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
            
            _addActivityLog(householdId, 'head_changed',
                (character.name || 'Unknown') + ' became head' + (oldHead ? ' (replacing ' + oldHead.characterName + ')' : ''),
                characterId);
            
            _logEvent('household', 'Head Changed',
                (character.name || 'Unknown') + ' became head of ' + household.name,
                [character]);
            
            _updateHouseholdStatus(householdId);
            
            _invalidateCaches();
            
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
    // 6. DEPARTMENT MANAGEMENT
    // =========================================================================

    function addDepartment(householdId, name, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            
            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }
            
            if (!name || name.trim() === '') {
                return { success: false, reason: 'Department name is required' };
            }
            
            var trimmedName = name.trim();
            
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
            
            if (options.headId) {
                var headChar = _getCharacterById(options.headId);
                if (headChar) {
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
            
            // Save using _setHouseholds - FIXED
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) {
                return { success: false, reason: 'Household not found in list' };
            }
            households[index] = household;
            state._setHouseholds(households);
            
            if (department.headId) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId === department.headId) {
                        household.members[i].departmentId = department.id;
                        household.members[i].isHead = true;
                        break;
                    }
                }
                // Save again if head changed
                households = state.getAllHouseholds({ includeDeprecated: true });
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        households[i] = household;
                        break;
                    }
                }
                state._setHouseholds(households);
            }
            
            _addActivityLog(householdId, 'department_added', 'Added department: ' + trimmedName);
            
            _invalidateCaches();
            
            return {
                success: true,
                department: department,
                household: household
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    function removeDepartment(householdId, departmentId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            
            var household = state.getHousehold(householdId);
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
            
            if (options.transferMembers !== false) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].departmentId === departmentId) {
                        household.members[i].departmentId = null;
                        if (household.members[i].isHead && !household.members[i].isHead) {
                            household.members[i].isHead = false;
                        }
                    }
                }
                // Save members changes
                var households = state.getAllHouseholds({ includeDeprecated: true });
                var index = -1;
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        index = i;
                        break;
                    }
                }
                if (index !== -1) {
                    households[index] = household;
                    state._setHouseholds(households);
                }
            }
            
            var departmentName = department.name;
            household.departments.splice(departmentIndex, 1);
            
            // Save using _setHouseholds
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }
            
            _addActivityLog(householdId, 'department_deleted', 'Deleted department: ' + departmentName);
            
            _invalidateCaches();
            
            return {
                success: true,
                department: department,
                household: household
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    function updateDepartment(householdId, departmentId, updates) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var household = state.getHousehold(householdId);
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
            
            if (updates.name && updates.name.trim()) {
                var trimmedName = updates.name.trim();
                if (trimmedName !== department.name) {
                    department.name = trimmedName;
                    changed = true;
                }
            }
            
            if (updates.headId !== undefined) {
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
            
            household.departments[departmentIndex] = department;
            
            // Save using _setHouseholds
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }
            
            _addActivityLog(householdId, 'department_updated', 
                'Updated department: ' + department.name);
            
            _invalidateCaches();
            
            return {
                success: true,
                department: department,
                household: household
            };
            
        } finally {
            _processingCommand = false;
        }
    }

    function setDepartmentHead(householdId, departmentId, characterId) {
        return updateDepartment(householdId, departmentId, { headId: characterId });
    }

    // =========================================================================
    // 7. HOUSEHOLD POSITION COMMANDS
    // =========================================================================

    function createHouseholdPosition(data) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var validation = _validatePositionCreation(data.householdId, data.name, data.requiredRoleId);
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            var result = state.createHouseholdPosition(data);
            if (result) {
                var roleName = data.requiredRoleId ? (_getRoleById(data.requiredRoleId)?.name || 'Unknown') : 'None';
                _logEvent('household', 'position_created',
                    'Created household position: ' + data.name + ' (Role: ' + roleName + ')',
                    []);
                return { success: true, position: result };
            }

            return { success: false, reason: 'Failed to create position' };

        } finally {
            _processingCommand = false;
        }
    }

    function updateHouseholdPosition(positionId, updates) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var position = state.getHouseholdPosition(positionId);
            if (!position) {
                return { success: false, reason: 'Position not found' };
            }

            if (updates.requiredRoleId !== undefined && updates.requiredRoleId !== null) {
                var role = _getRoleById(updates.requiredRoleId);
                if (!role) {
                    return { success: false, reason: 'Required role not found' };
                }
            }

            var result = state.updateHouseholdPosition(positionId, updates);
            if (result) {
                _logEvent('household', 'position_updated',
                    'Updated household position: ' + result.name,
                    []);
                return { success: true, position: result };
            }

            return { success: false, reason: 'Failed to update position' };

        } finally {
            _processingCommand = false;
        }
    }

    function deleteHouseholdPosition(positionId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};
            var position = state.getHouseholdPosition(positionId);
            if (!position) {
                return { success: false, reason: 'Position not found' };
            }

            var result = state.deleteHouseholdPosition(positionId, options);
            if (result) {
                _logEvent('household', 'position_deleted',
                    'Deleted household position: ' + position.name,
                    []);
                return { success: true };
            }

            return { success: false, reason: 'Failed to delete position' };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. HOUSEHOLD ASSIGNMENT COMMANDS
    // =========================================================================

    function assignCharacterToHouseholdPosition(positionId, characterId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            options = options || {};

            var position = state.getHouseholdPosition(positionId);
            if (!position) {
                return { success: false, reason: 'Position not found' };
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeceased) {
                return { success: false, reason: 'Character is deceased' };
            }

            var existing = state.getAssignmentsForPosition(positionId, true);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].characterId === characterId) {
                    return { success: false, reason: 'Character already assigned to this position' };
                }
            }

            // Check role requirement
            var requiredRoleId = position.requiredRoleId;
            var hasRole = false;
            var skillLevel = 0;

            if (requiredRoleId) {
                if (character.professions) {
                    for (var i = 0; i < character.professions.length; i++) {
                        if (character.professions[i].id === requiredRoleId) {
                            hasRole = true;
                            skillLevel = character.professions[i].skillLevel || 0;
                            break;
                        }
                    }
                }

                if (!hasRole) {
                    if (options.addRoleIfMissing === true) {
                        var defaultSkill = options.defaultSkillLevel || 10;
                        var role = _getRoleById(requiredRoleId);
                        var result = _addProfession(characterId, requiredRoleId, {
                            skillLevel: defaultSkill,
                            startYear: options.startYear || _getCurrentYear()
                        });
                        if (result && result.success) {
                            hasRole = true;
                            skillLevel = defaultSkill;
                        } else {
                            return { success: false, reason: 'Failed to add required role to character' };
                        }
                    } else {
                        return { 
                            success: false, 
                            reason: 'Character does not have the required role: ' + (_getRoleById(requiredRoleId)?.name || requiredRoleId),
                            requiresRole: true,
                            requiredRoleId: requiredRoleId
                        };
                    }
                }

                if (position.minSkillLevel && skillLevel < position.minSkillLevel) {
                    return { 
                        success: false, 
                        reason: 'Character skill level (' + skillLevel + ') is below requirement (' + position.minSkillLevel + ')',
                        currentSkill: skillLevel,
                        requiredSkill: position.minSkillLevel
                    };
                }
            }

            var result = state.assignCharacterToHouseholdPosition(positionId, characterId, options);
            if (result) {
                var title = options.title || position.name;
                var roleName = requiredRoleId ? (_getRoleById(requiredRoleId)?.name || 'None') : 'None';
                _logEvent('household', 'assigned_to_position',
                    character.name + ' assigned as ' + title + ' (Role: ' + roleName + ')',
                    [character]);
                return { success: true, assignment: result };
            }

            return { success: false, reason: 'Failed to assign character' };

        } finally {
            _processingCommand = false;
        }
    }

    function endHouseholdAssignment(assignmentId, endYear, reason) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var assignment = state.getHouseholdAssignment(assignmentId);
            if (!assignment) {
                return { success: false, reason: 'Assignment not found' };
            }

            if (assignment.endYear) {
                return { success: false, reason: 'Assignment already ended' };
            }

            var result = state.endHouseholdAssignment(assignmentId, endYear, reason);
            if (result) {
                var character = _getCharacterById(assignment.characterId);
                _logEvent('household', 'assignment_ended',
                    (character ? character.name : 'Unknown') + ' ended assignment',
                    []);
                return { success: true, assignment: result };
            }

            return { success: false, reason: 'Failed to end assignment' };

        } finally {
            _processingCommand = false;
        }
    }

    function deleteHouseholdAssignment(assignmentId) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var assignment = state.getHouseholdAssignment(assignmentId);
            if (!assignment) {
                return { success: false, reason: 'Assignment not found' };
            }

            var result = state.deleteHouseholdAssignment(assignmentId);
            if (result) {
                _logEvent('household', 'assignment_deleted',
                    'Deleted household assignment',
                    []);
                return { success: true };
            }

            return { success: false, reason: 'Failed to delete assignment' };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. BULK HOUSEHOLD ASSIGNMENT
    // =========================================================================

    function bulkAssignHouseholdPositions(assignments, options) {
        if (_processingCommand) {
            return { success: 0, failed: 0, errors: [] };
        }
        _processingCommand = true;

        try {
            options = options || {};
            var results = { success: 0, failed: 0, errors: [] };

            for (var i = 0; i < assignments.length; i++) {
                var data = assignments[i];
                var addRoleIfMissing = options.addRoleIfMissing === true;
                
                var result = assignCharacterToHouseholdPosition(
                    data.positionId,
                    data.characterId,
                    {
                        startYear: options.startYear || data.startYear,
                        endYear: options.endYear || data.endYear,
                        title: options.title || data.title,
                        notes: options.notes || data.notes,
                        addRoleIfMissing: addRoleIfMissing,
                        defaultSkillLevel: options.defaultSkillLevel || 10
                    }
                );

                if (result.success) {
                    results.success++;
                } else {
                    results.failed++;
                    results.errors.push({
                        positionId: data.positionId,
                        characterId: data.characterId,
                        reason: result.reason
                    });
                }
            }

            return results;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. SALARY AND TUITION COMMANDS
    // =========================================================================

    function addSalaryToHousehold(householdId, characterId, roleId, amount, reason, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            var currentYear = year || _getCurrentYear();
            var finalAmount = Math.max(0, amount);

            if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.receiveSalary) {
                var result = window.HouseholdEconomy.receiveSalary(householdId, characterId, roleId, finalAmount, currentYear);
                if (result) {
                    _logEvent('household', 'salary_added',
                        'Added ' + finalAmount + 'g salary for ' + character.name + (reason ? ' (' + reason + ')' : ''),
                        [character]);
                    _showToast('Salary of ' + finalAmount + 'g added to ' + household.name, 'success');
                    return { success: true, amount: finalAmount };
                }
                return { success: false, reason: 'Failed to add salary' };
            }

            var newWealth = state.updateHouseholdWealth(householdId, finalAmount, 'Salary for ' + character.name + (reason ? ' (' + reason + ')' : ''));

            if (newWealth !== null) {
                _logEvent('household', 'salary_added',
                    'Added ' + finalAmount + 'g salary for ' + character.name + (reason ? ' (' + reason + ')' : ''),
                    [character]);
                _showToast('Salary of ' + finalAmount + 'g added to ' + household.name, 'success');
                return { success: true, amount: finalAmount, newWealth: newWealth };
            }

            return { success: false, reason: 'Failed to add salary' };

        } finally {
            _processingCommand = false;
        }
    }

    function deductTuitionFromHousehold(householdId, studentId, institutionId, amount, reason, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var student = _getCharacterById(studentId);
            if (!student) {
                return { success: false, reason: 'Student not found' };
            }

            var currentYear = year || _getCurrentYear();
            var finalAmount = Math.max(0, amount);

            var wealth = state.getHouseholdWealth(householdId);
            if (wealth < finalAmount) {
                return { success: false, reason: 'Household cannot afford tuition (' + finalAmount + 'g needed, ' + wealth + 'g available)' };
            }

            if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.trackTuitionExpense) {
                var result = window.HouseholdEconomy.trackTuitionExpense(householdId, finalAmount, institutionId, studentId, currentYear);
                if (result) {
                    state.updateHouseholdWealth(householdId, -finalAmount, 'Tuition for ' + student.name + (reason ? ' (' + reason + ')' : ''));
                    _logEvent('household', 'tuition_deducted',
                        'Deducted ' + finalAmount + 'g tuition for ' + student.name + (reason ? ' (' + reason + ')' : ''),
                        [student]);
                    _showToast('Tuition of ' + finalAmount + 'g deducted from ' + household.name, 'info');
                    return { success: true, amount: finalAmount };
                }
                return { success: false, reason: 'Failed to track tuition' };
            }

            var newWealth = state.updateHouseholdWealth(householdId, -finalAmount, 'Tuition for ' + student.name + (reason ? ' (' + reason + ')' : ''));

            if (newWealth !== null) {
                _logEvent('household', 'tuition_deducted',
                    'Deducted ' + finalAmount + 'g tuition for ' + student.name + (reason ? ' (' + reason + ')' : ''),
                    [student]);
                _showToast('Tuition of ' + finalAmount + 'g deducted from ' + household.name, 'info');
                return { success: true, amount: finalAmount, newWealth: newWealth };
            }

            return { success: false, reason: 'Failed to deduct tuition' };

        } finally {
            _processingCommand = false;
        }
    }

    function getHouseholdSalaryIncome(householdId, year) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getSalaryIncome) {
            return window.HouseholdEconomy.getSalaryIncome(householdId, year);
        }
        return 0;
    }

    function getHouseholdTuitionExpenses(householdId, year) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getTuitionExpenses) {
            return window.HouseholdEconomy.getTuitionExpenses(householdId, year);
        }
        return 0;
    }

    // =========================================================================
    // 11. SCHOOL PROFIT COMMANDS
    // =========================================================================

    function addSchoolProfitToHousehold(householdId, amount, institutionId, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var currentYear = year || _getCurrentYear();
            var finalAmount = Math.max(0, amount);

            if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.receiveSchoolProfit) {
                var result = window.HouseholdEconomy.receiveSchoolProfit(householdId, finalAmount, institutionId, currentYear);
                if (result) {
                    _logEvent('household', 'school_profit_added',
                        'Added ' + finalAmount + 'g school profit from institution ' + institutionId + (currentYear ? ' (' + currentYear + ')' : ''),
                        []);
                    _showToast('School profit of ' + finalAmount + 'g added to ' + household.name, 'success');
                    return { success: true, amount: finalAmount };
                }
                return { success: false, reason: 'Failed to add school profit' };
            }

            var newWealth = state.updateHouseholdWealth(householdId, finalAmount, 'School profit');

            if (newWealth !== null) {
                _logEvent('household', 'school_profit_added',
                    'Added ' + finalAmount + 'g school profit to ' + household.name,
                    []);
                _showToast('School profit of ' + finalAmount + 'g added to ' + household.name, 'success');
                return { success: true, amount: finalAmount, newWealth: newWealth };
            }

            return { success: false, reason: 'Failed to add school profit' };

        } finally {
            _processingCommand = false;
        }
    }

    function getSchoolProfits(householdId, year) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getSchoolProfits) {
            return window.HouseholdEconomy.getSchoolProfits(householdId, year);
        }
        return 0;
    }

    // =========================================================================
    // 12. REPAIR FUNCTIONS
    // =========================================================================

    function repairMemberships(options) {
        options = options || {};
        var saveAfter = options.saveAfter !== false;
        var verbose = options.verbose || false;
        
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var characters = window.getCharacters ? window.getCharacters() : [];
            var households = state.getAllHouseholds({ includeDeprecated: true });
            
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
            
            var charMap = {};
            for (var i = 0; i < characters.length; i++) {
                charMap[characters[i].id] = characters[i];
            }
            
            var householdMap = {};
            for (var i = 0; i < households.length; i++) {
                householdMap[households[i].id] = households[i];
            }
            
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
            
            var charsWithHousehold = characters.filter(function(c) { 
                return c.household || c.householdId; 
            });
            
            if (verbose) {
                console.log('📊 Found ' + charsWithHousehold.length + ' characters with household references');
            }
            
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
            
            for (var i = 0; i < households.length; i++) {
                _updateHouseholdStatus(households[i].id);
            }
            
            if (saveAfter) {
                _saveMasterData();
                _invalidateCaches();
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

    function fixCharacterHousehold(characterId, householdId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;
        
        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }
            
            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }
            
            var currentHouseholdId = character.household || character.householdId || null;
            
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
            
            var targetHousehold = state.getHousehold(householdId);
            if (!targetHousehold) {
                return { success: false, reason: 'Target household not found' };
            }
            
            if (currentHouseholdId === householdId) {
                return { 
                    success: true, 
                    action: 'already_member', 
                    character: character.name || 'Unknown' 
                };
            }
            
            if (currentHouseholdId) {
                removeMember(currentHouseholdId, characterId, {
                    reason: 'Moved to ' + targetHousehold.name + ' by repair function',
                    recordHistory: false
                });
            }
            
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
    // 13. PUBLIC API - HISTORY
    // =========================================================================

    function recordHistory(characterId, householdId, year, action, reason, options) {
        return _recordCharacterHouseholdChange(characterId, householdId, year, action, reason, options);
    }

    // =========================================================================
    // 14. DEMOLISH HOUSEHOLD
    // =========================================================================

    function demolishHousehold(householdId, reason, year, options) {
        if (_processingCommand) {
            return { success: false, error: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, error: 'Household state not available' };
            }

            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, error: 'Household not found' };
            }

            if (household.status === 'destroyed' || household.status === 'deprecated') {
                return { success: false, error: 'Household already destroyed' };
            }

            options = options || {};
            var demolishYear = year || _getCurrentYear();
            var demolishReason = reason || 'Destroyed';

            var demolitionRecord = {
                householdId: household.id,
                householdName: household.name,
                locationId: household.locationId,
                locationName: household.locationName || 'Unknown',
                demolishedYear: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                memberCount: (household.members || []).length,
                headId: household.headId || null,
                headName: household.headName || null,
                previousWealth: household.wealth || 0,
                previousReputation: household.reputation || 0,
                residenceId: household.residenceId || null,
                residenceName: household.residenceName || null,
                timestamp: Date.now()
            };

            var members = (household.members || []).slice();
            var removedCount = 0;

            for (var i = 0; i < members.length; i++) {
                var member = members[i];
                try {
                    var result = removeMember(householdId, member.characterId, {
                        reason: 'Household destroyed: ' + demolishReason,
                        leftYear: demolishYear,
                        recordHistory: true
                    });
                    if (result && result.success) {
                        removedCount++;
                    }
                } catch (e) {
                    // Continue with other members
                }
            }

            // Update household
            var updates = {
                status: 'destroyed',
                demolishedAt: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                demolishedRecord: demolitionRecord,
                members: [],
                headId: null,
                headName: null,
                wealth: 0,
                reputation: Math.max(0, (household.reputation || 0) - 50),
                updatedAt: Date.now()
            };

            // Apply updates using _setHouseholds
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) {
                return { success: false, error: 'Household not found in list' };
            }
            
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    households[index][key] = updates[key];
                }
            }
            state._setHouseholds(households);

            if (options.demolishResidence !== false && household.residenceId) {
                try {
                    var residenceSystem = _getResidenceSystem();
                    if (residenceSystem && typeof residenceSystem.demolishResidence === 'function') {
                        var residenceResult = residenceSystem.demolishResidence(
                            household.residenceId,
                            'Household destroyed: ' + demolishReason,
                            demolishYear,
                            {
                                destroyedBy: options.destroyedBy || 'manual',
                                disasterId: options.disasterId || null,
                                silent: true
                            }
                        );
                        demolitionRecord.residenceDemolished = residenceResult.success;
                    }
                } catch (e) {
                    demolitionRecord.residenceDemolished = false;
                }
            }

            var updatedHousehold = state.getHousehold(householdId);
            if (updatedHousehold) {
                if (!updatedHousehold.history) updatedHousehold.history = [];
                updatedHousehold.history.push({
                    year: demolishYear,
                    type: 'demolished',
                    reason: demolishReason,
                    destroyedBy: options.destroyedBy || 'manual',
                    disasterId: options.disasterId || null,
                    record: demolitionRecord,
                    timestamp: Date.now()
                });
                // Save again
                households = state.getAllHouseholds({ includeDeprecated: true });
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        households[i] = updatedHousehold;
                        break;
                    }
                }
                state._setHouseholds(households);
            }

            _invalidateCaches();

            _logEvent('household', 'Household Destroyed',
                'Household "' + household.name + '" destroyed: ' + demolishReason,
                []);

            if (!options.silent) {
                _showToast('Household "' + household.name + '" destroyed', 'info');
            }

            return {
                success: true,
                demolitionRecord: demolitionRecord,
                household: state.getHousehold(householdId),
                membersRemoved: removedCount
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 15. DEMOLISHED HOUSEHOLD QUERIES
    // =========================================================================

    function getDemolishedHouseholds(options) {
        try {
            var state = _getState();
            if (!state) return [];

            options = options || {};
            var all = state.getAllHouseholds({ includeDeprecated: true });
            var filtered = all.filter(function(h) {
                return h.status === 'destroyed';
            });

            if (options.locationId) {
                filtered = filtered.filter(function(h) {
                    return h.locationId === options.locationId;
                });
            }

            if (options.destroyedBy) {
                filtered = filtered.filter(function(h) {
                    return h.destroyedBy === options.destroyedBy;
                });
            }

            if (!options.includeRecords) {
                filtered = filtered.map(function(h) {
                    var result = { ...h };
                    delete result.demolishedRecord;
                    return result;
                });
            }

            return filtered;
        } catch (e) {
            return [];
        }
    }

    function getHouseholdDemolitionStats(locationId) {
        var stats = {
            totalDemolished: 0,
            byDestroyedBy: {},
            totalMembersLost: 0,
            totalWealthLost: 0,
            recentDemolitions: []
        };

        try {
            var demolished = getDemolishedHouseholds({
                locationId: locationId,
                includeRecords: true
            });

            stats.totalDemolished = demolished.length;

            for (var i = 0; i < demolished.length; i++) {
                var h = demolished[i];
                var record = h.demolishedRecord;

                var destroyedBy = h.destroyedBy || 'unknown';
                if (!stats.byDestroyedBy[destroyedBy]) {
                    stats.byDestroyedBy[destroyedBy] = 0;
                }
                stats.byDestroyedBy[destroyedBy]++;

                if (record && record.memberCount) {
                    stats.totalMembersLost += record.memberCount;
                }

                if (record && record.previousWealth) {
                    stats.totalWealthLost += record.previousWealth;
                }

                if (stats.recentDemolitions.length < 5) {
                    stats.recentDemolitions.push({
                        name: h.name,
                        destroyedAt: h.demolishedAt,
                        destroyedBy: h.destroyedBy,
                        reason: h.demolishedReason,
                        membersLost: record ? record.memberCount : 0
                    });
                }
            }

            stats.recentDemolitions.sort(function(a, b) {
                return (b.destroyedAt || 0) - (a.destroyedAt || 0);
            });

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    // =========================================================================
    // 16. EXPORTS
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
        
        // Household position commands
        createHouseholdPosition: createHouseholdPosition,
        updateHouseholdPosition: updateHouseholdPosition,
        deleteHouseholdPosition: deleteHouseholdPosition,

        // Household assignment commands
        assignCharacterToHouseholdPosition: assignCharacterToHouseholdPosition,
        endHouseholdAssignment: endHouseholdAssignment,
        deleteHouseholdAssignment: deleteHouseholdAssignment,

        // Bulk operations
        bulkAssignHouseholdPositions: bulkAssignHouseholdPositions,

        // Salary and tuition commands
        addSalaryToHousehold: addSalaryToHousehold,
        deductTuitionFromHousehold: deductTuitionFromHousehold,
        getHouseholdSalaryIncome: getHouseholdSalaryIncome,
        getHouseholdTuitionExpenses: getHouseholdTuitionExpenses,

        // School profit commands
        addSchoolProfitToHousehold: addSchoolProfitToHousehold,
        getSchoolProfits: getSchoolProfits,

        // History
        recordHistory: recordHistory,
        
        // Repair
        repairMemberships: repairMemberships,
        fixCharacterHousehold: fixCharacterHousehold,

        // Demolish functions
        demolishHousehold: demolishHousehold,
        getDemolishedHouseholds: getDemolishedHouseholds,
        getHouseholdDemolitionStats: getHouseholdDemolitionStats
    };

    // Legacy aliases
    if (typeof window !== 'undefined') {
        window._demolishHousehold = demolishHousehold;
        window._getDemolishedHouseholds = getDemolishedHouseholds;
        window._getHouseholdDemolitionStats = getHouseholdDemolitionStats;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdCommands;
    }

})();