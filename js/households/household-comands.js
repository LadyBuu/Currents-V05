/**
 * =============================================================================
 * HOUSEHOLD COMMANDS (household-commands.js)
 * =============================================================================
 * 
 * PURPOSE: All write operations for households.
 * 
 * UPDATED: Added household position management commands
 * UPDATED: Added assignment management commands
 * UPDATED: Integrated with Role System via requiredRoleId
 * UPDATED: Added salary and tuition command wrappers
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

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
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
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _addProfession(characterId, roleId, options) {
        if (typeof window.addProfession === 'function') {
            return window.addProfession(characterId, roleId, options);
        }
        return { success: false };
    }

    // =========================================================================
    // 2. HOUSEHOLD STATE REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;

    // =========================================================================
    // 3. INTERNAL HELPERS
    // =========================================================================

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

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
        
        if (household.activityLog.length > 100) {
            household.activityLog = household.activityLog.slice(-100);
        }
        
        _state.updateHousehold(householdId, {
            activityLog: household.activityLog
        }, { recordHistory: false });
        
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
            var household = householdId ? _state.getHousehold(householdId) : null;
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
        var household = _state.getHousehold(householdId);
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
        var household = _state.getHousehold(householdId);
        if (!household) return;
        
        var status = _state.getHouseholdStatus(householdId);
        if (status.status !== household.status) {
            _state.updateHousehold(householdId, {
                status: status.status
            }, { recordHistory: false });
        }
    }

    function _validatePositionCreation(householdId, name, requiredRoleId) {
        var household = _state.getHousehold(householdId);
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
            options = options || {};
            
            var validation = _validateMemberAddition(householdId, characterId, type);
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }
            
            var household = _state.getHousehold(householdId);
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
            
            var updates = {
                members: household.members,
                updatedAt: Date.now()
            };
            
            _state.updateHousehold(householdId, updates, { recordHistory: false });
            
            if (isHead) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId !== characterId && household.members[i].isHead) {
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                    }
                }
                _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
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
            
            var updates = {
                members: household.members,
                updatedAt: Date.now()
            };
            
            _state.updateHousehold(householdId, updates, { recordHistory: false });
            
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
            
            _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            
            if (member.isHead && !oldIsHead) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].characterId !== characterId && household.members[i].isHead) {
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                    }
                }
                _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
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
    // 5. HEAD OF HOUSEHOLD MANAGEMENT
    // =========================================================================

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
            
            _state.updateHousehold(householdId, { members: household.members }, { recordHistory: false });
            
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
    // 6. DEPARTMENT MANAGEMENT
    // =========================================================================

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
            
            _state.updateHousehold(householdId, { departments: household.departments }, { recordHistory: false });
            
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
            _state.updateHousehold(householdId, { 
                departments: household.departments,
                members: household.members
            }, { recordHistory: false });
            
            _addActivityLog(householdId, 'department_updated', 
                'Updated department: ' + department.name);
            
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
            var validation = _validatePositionCreation(data.householdId, data.name, data.requiredRoleId);
            if (!validation.valid) {
                return { success: false, reason: validation.reason };
            }

            var result = _state.createHouseholdPosition(data);
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
            var position = _state.getHouseholdPosition(positionId);
            if (!position) {
                return { success: false, reason: 'Position not found' };
            }

            if (updates.requiredRoleId !== undefined && updates.requiredRoleId !== null) {
                var role = _getRoleById(updates.requiredRoleId);
                if (!role) {
                    return { success: false, reason: 'Required role not found' };
                }
            }

            var result = _state.updateHouseholdPosition(positionId, updates);
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
            options = options || {};
            var position = _state.getHouseholdPosition(positionId);
            if (!position) {
                return { success: false, reason: 'Position not found' };
            }

            var result = _state.deleteHouseholdPosition(positionId, options);
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
            options = options || {};

            var position = _state.getHouseholdPosition(positionId);
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

            var existing = _state.getAssignmentsForPosition(positionId, true);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].characterId === characterId) {
                    return { success: false, reason: 'Character already assigned to this position' };
                }
            }

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
                    if (options.addRoleIfMissing !== false) {
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
                        return { success: false, reason: 'Character does not have required role: ' + (_getRoleById(requiredRoleId)?.name || requiredRoleId) };
                    }
                }

                if (position.minSkillLevel && skillLevel < position.minSkillLevel) {
                    return { success: false, reason: 'Character skill level (' + skillLevel + ') is below requirement (' + position.minSkillLevel + ')' };
                }
            }

            var result = _state.assignCharacterToHouseholdPosition(positionId, characterId, options);
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
            var assignment = _state.getHouseholdAssignment(assignmentId);
            if (!assignment) {
                return { success: false, reason: 'Assignment not found' };
            }

            if (assignment.endYear) {
                return { success: false, reason: 'Assignment already ended' };
            }

            var result = _state.endHouseholdAssignment(assignmentId, endYear, reason);
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
            var assignment = _state.getHouseholdAssignment(assignmentId);
            if (!assignment) {
                return { success: false, reason: 'Assignment not found' };
            }

            var result = _state.deleteHouseholdAssignment(assignmentId);
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
                var result = assignCharacterToHouseholdPosition(
                    data.positionId,
                    data.characterId,
                    {
                        startYear: options.startYear || data.startYear,
                        endYear: options.endYear || data.endYear,
                        title: options.title || data.title,
                        notes: options.notes || data.notes,
                        addRoleIfMissing: options.addRoleIfMissing !== false,
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
    // 10. SALARY AND TUITION COMMANDS (NEW)
    // =========================================================================

    /**
     * Adds salary to a household from a character's profession
     * @param {string} householdId - Household ID
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID (optional)
     * @param {number} amount - Salary amount
     * @param {string} reason - Reason for salary
     * @param {number} year - Year (default: current)
     * @returns {Object} Result object
     */
    function addSalaryToHousehold(householdId, characterId, roleId, amount, reason, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            var currentYear = year || _getCurrentYear();
            var finalAmount = Math.max(0, amount);

            // Use HouseholdEconomy.receiveSalary if available
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

            // Fallback: direct wealth update
            var newWealth = _updateHouseholdWealth(householdId, finalAmount, 'Salary for ' + character.name + (reason ? ' (' + reason + ')' : ''));

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

    /**
     * Deducts tuition from a household
     * @param {string} householdId - Household ID
     * @param {string} studentId - Student character ID
     * @param {string} institutionId - Institution ID
     * @param {number} amount - Tuition amount
     * @param {string} reason - Reason for tuition
     * @param {number} year - Year (default: current)
     * @returns {Object} Result object
     */
    function deductTuitionFromHousehold(householdId, studentId, institutionId, amount, reason, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var household = _state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var student = _getCharacterById(studentId);
            if (!student) {
                return { success: false, reason: 'Student not found' };
            }

            var currentYear = year || _getCurrentYear();
            var finalAmount = Math.max(0, amount);

            // Check if household can afford it
            var wealth = _getHouseholdWealth(householdId);
            if (wealth < finalAmount) {
                return { success: false, reason: 'Household cannot afford tuition (' + finalAmount + 'g needed, ' + wealth + 'g available)' };
            }

            // Use HouseholdEconomy.trackTuitionExpense if available
            if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.trackTuitionExpense) {
                var result = window.HouseholdEconomy.trackTuitionExpense(householdId, finalAmount, institutionId, studentId, currentYear);
                if (result) {
                    // Also deduct from wealth
                    _updateHouseholdWealth(householdId, -finalAmount, 'Tuition for ' + student.name + (reason ? ' (' + reason + ')' : ''));
                    _logEvent('household', 'tuition_deducted',
                        'Deducted ' + finalAmount + 'g tuition for ' + student.name + (reason ? ' (' + reason + ')' : ''),
                        [student]);
                    _showToast('Tuition of ' + finalAmount + 'g deducted from ' + household.name, 'info');
                    return { success: true, amount: finalAmount };
                }
                return { success: false, reason: 'Failed to track tuition' };
            }

            // Fallback: direct wealth update
            var newWealth = _updateHouseholdWealth(householdId, -finalAmount, 'Tuition for ' + student.name + (reason ? ' (' + reason + ')' : ''));

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

    /**
     * Gets the salary income for a household
     * @param {string} householdId - Household ID
     * @param {number} year - Year (optional)
     * @returns {number} Salary income amount
     */
    function getHouseholdSalaryIncome(householdId, year) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getSalaryIncome) {
            return window.HouseholdEconomy.getSalaryIncome(householdId, year);
        }
        return 0;
    }

    /**
     * Gets the tuition expenses for a household
     * @param {string} householdId - Household ID
     * @param {number} year - Year (optional)
     * @returns {number} Tuition expenses amount
     */
    function getHouseholdTuitionExpenses(householdId, year) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getTuitionExpenses) {
            return window.HouseholdEconomy.getTuitionExpenses(householdId, year);
        }
        return 0;
    }

    // =========================================================================
    // 11. REPAIR FUNCTIONS
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
    // 12. PUBLIC API - HISTORY
    // =========================================================================

    function recordHistory(characterId, householdId, year, action, reason, options) {
        return _recordCharacterHouseholdChange(characterId, householdId, year, action, reason, options);
    }

    // =========================================================================
    // 13. EXPORTS
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
        fixCharacterHousehold: fixCharacterHousehold,

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

        // NEW: Salary and tuition commands
        addSalaryToHousehold: addSalaryToHousehold,
        deductTuitionFromHousehold: deductTuitionFromHousehold,
        getHouseholdSalaryIncome: getHouseholdSalaryIncome,
        getHouseholdTuitionExpenses: getHouseholdTuitionExpenses
    };

    // Legacy aliases
    window.createHouseholdPosition = createHouseholdPosition;
    window.updateHouseholdPosition = updateHouseholdPosition;
    window.deleteHouseholdPosition = deleteHouseholdPosition;
    window.assignCharacterToHouseholdPosition = assignCharacterToHouseholdPosition;
    window.endHouseholdAssignment = endHouseholdAssignment;
    window.deleteHouseholdAssignment = deleteHouseholdAssignment;
    window.bulkAssignHouseholdPositions = bulkAssignHouseholdPositions;

    // NEW legacy aliases
    window.addSalaryToHousehold = addSalaryToHousehold;
    window.deductTuitionFromHousehold = deductTuitionFromHousehold;
    window.getHouseholdSalaryIncome = getHouseholdSalaryIncome;
    window.getHouseholdTuitionExpenses = getHouseholdTuitionExpenses;

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
            fixCharacterHousehold: fixCharacterHousehold,
            createHouseholdPosition: createHouseholdPosition,
            updateHouseholdPosition: updateHouseholdPosition,
            deleteHouseholdPosition: deleteHouseholdPosition,
            assignCharacterToHouseholdPosition: assignCharacterToHouseholdPosition,
            endHouseholdAssignment: endHouseholdAssignment,
            deleteHouseholdAssignment: deleteHouseholdAssignment,
            bulkAssignHouseholdPositions: bulkAssignHouseholdPositions,
            addSalaryToHousehold: addSalaryToHousehold,
            deductTuitionFromHousehold: deductTuitionFromHousehold,
            getHouseholdSalaryIncome: getHouseholdSalaryIncome,
            getHouseholdTuitionExpenses: getHouseholdTuitionExpenses
        };
    }

})();