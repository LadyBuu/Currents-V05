/**
 * =============================================================================
 * STILL WATERS - FRIENDSHIP MODALS
 * =============================================================================
 * 
 * This file contains ALL friendship-specific UI modals:
 * - Create Friendship Modal (multi-select)
 * - Edit Friendship Modal
 * - Breakup/End Friendship Modal
 * - View Friendship Modal
 * - Friend Recommendations Modal
 * - Group Friendship Modal
 * 
 * UPDATED: Uses FriendshipLogic from friendship-logic.js
 * 
 * =============================================================================
 */

// =============================================================================
// 1. ICON HELPERS
// =============================================================================

function _getIcon(name) {
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    if (window.Icons && window.Icons.CIRCLE) {
        return window.Icons.CIRCLE;
    }
    return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
}

// =============================================================================
// 2. CONSTANTS
// =============================================================================

var FRIENDSHIP_REASONS = {
    drifted_apart: { icon: 'CIRCLE_DOT', label: 'Drifted Apart', description: 'Slowly lost touch over time' },
    betrayal: { icon: 'X_HEAVY', label: 'Betrayal', description: 'One betrayed the other\'s trust' },
    argument: { icon: 'WARNING', label: 'Major Argument', description: 'Major argument that couldn\'t be resolved' },
    jealousy: { icon: 'CIRCLE_DOT', label: 'Jealousy', description: 'Jealousy over achievements or relationships' },
    distance: { icon: 'LOCATION', label: 'Distance', description: 'Moved away or physical separation' },
    different_paths: { icon: 'CIRCLE_DOT', label: 'Different Paths', description: 'Life took them in different directions' },
    romance: { icon: 'HEART', label: 'Romance', description: 'Became romantic partners' },
    rivalry: { icon: 'SWORD', label: 'Rivalry', description: 'Became rivals or competitors' },
    mutual: { icon: 'CIRCLE_DOT', label: 'Mutual Agreement', description: 'Mutual agreement to end the friendship' },
    other: { icon: 'CIRCLE_DOT', label: 'Other', description: 'Other unspecified reasons' }
};

// =============================================================================
// 3. DEPENDENCY WRAPPERS
// =============================================================================

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _showToast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else if (typeof window.showToastMessage === 'function') window.showToastMessage(msg, type);
}

function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
    return null;
}

function _getCharacters() {
    if (typeof window.getCharacters === 'function') return window.getCharacters();
    return [];
}

function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') return window.getCurrentLocation(character);
    return 'Unknown';
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') return window.getActiveRankDisplay(character);
    return null;
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') window.saveMasterData();
}

function _openModal(options) {
    if (typeof window.openModal === 'function') return window.openModal(options);
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') window.closeTopModal();
}

function _showUndoPrompt(description, undo, redo) {
    if (typeof window.showUndoPrompt === 'function') return window.showUndoPrompt(description, undo, redo);
    if (undo) undo();
}

function _confirmDialog(message, title, onConfirm) {
    if (typeof window.confirmDialog === 'function') window.confirmDialog(message, title, onConfirm);
    else if (confirm(message)) onConfirm();
}

// =============================================================================
// 4. FRIENDSHIP LOGIC WRAPPERS
// =============================================================================

function _createFriendship(idA, idB, options) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.createFriendship(idA, idB, options);
    }
    if (typeof window.createFriendship === 'function') {
        return window.createFriendship(idA, idB, options);
    }
    return null;
}

function _areFriends(idA, idB) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.areFriends(idA, idB);
    }
    if (typeof window.areFriends === 'function') {
        return window.areFriends(idA, idB);
    }
    return false;
}

function _getFriends(id) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.getFriends(id);
    }
    if (typeof window.getFriends === 'function') {
        return window.getFriends(id);
    }
    return [];
}

function _getFriendsWithDetails(id) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.getFriendsWithDetails(id);
    }
    if (typeof window.getFriendsWithDetails === 'function') {
        return window.getFriendsWithDetails(id);
    }
    return [];
}

function _getFriendshipStrength(idA, idB) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.getFriendshipStrength(idA, idB);
    }
    if (typeof window.getFriendshipStrength === 'function') {
        return window.getFriendshipStrength(idA, idB);
    }
    return 0;
}

function _increaseFriendshipStrength(idA, idB, amount) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.increaseFriendshipStrength(idA, idB, amount);
    }
    if (typeof window.increaseFriendshipStrength === 'function') {
        return window.increaseFriendshipStrength(idA, idB, amount);
    }
    return 0;
}

function _decreaseFriendshipStrength(idA, idB, amount) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.decreaseFriendshipStrength(idA, idB, amount);
    }
    if (typeof window.decreaseFriendshipStrength === 'function') {
        return window.decreaseFriendshipStrength(idA, idB, amount);
    }
    return 0;
}

function _recordFriendshipEvent(idA, idB, event) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.recordFriendshipEvent(idA, idB, event);
    }
    if (typeof window.recordFriendshipEvent === 'function') {
        return window.recordFriendshipEvent(idA, idB, event);
    }
}

function _removeFriendship(idA, idB, options) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.removeFriendship(idA, idB, options);
    }
    if (typeof window.removeFriendship === 'function') {
        return window.removeFriendship(idA, idB, options);
    }
    return false;
}

function _getMutualFriends(idA, idB) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.getMutualFriends(idA, idB);
    }
    if (typeof window.getMutualFriends === 'function') {
        return window.getMutualFriends(idA, idB);
    }
    return [];
}

function _getBestFriend(id) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.getBestFriend(id);
    }
    if (typeof window.getBestFriend === 'function') {
        return window.getBestFriend(id);
    }
    return null;
}

function _getFriendshipStats(id) {
    if (typeof window.FriendshipLogic !== 'undefined') {
        return window.FriendshipLogic.getFriendshipStats(id);
    }
    if (typeof window.getFriendshipStats === 'function') {
        return window.getFriendshipStats(id);
    }
    return { totalFriends: 0, averageStrength: 0, longestFriendship: null, totalStrength: 0 };
}

function _getRelationshipBetween(idA, idB) {
    if (typeof window.getRelationshipBetween === 'function') {
        return window.getRelationshipBetween(idA, idB);
    }
    return null;
}

function _findFriendship(char1, char2) {
    if (!char1 || !char2) return null;
    
    if (char1.friendships) {
        for (var i = 0; i < char1.friendships.length; i++) {
            if (char1.friendships[i].friendId === char2.id) {
                return char1.friendships[i];
            }
        }
    }
    
    if (char2.friendships) {
        for (var i = 0; i < char2.friendships.length; i++) {
            if (char2.friendships[i].friendId === char1.id) {
                return char2.friendships[i];
            }
        }
    }
    
    var rel = _getRelationshipBetween(char1.id, char2.id);
    if (rel && rel.type === 'friendship') {
        return rel;
    }
    
    return null;
}

// =============================================================================
// 5. CHARACTER SELECTOR
// =============================================================================

function _openCharacterSelectorForFriendship(title, onSelect, options) {
    options = options || {};
    
    if (typeof window.openUnifiedCharacterSelector === 'function') {
        window.openUnifiedCharacterSelector({
            title: title || 'Select Character',
            targetId: options.targetId || null,
            onSelect: onSelect,
            filters: {
                gender: options.gender || 'all',
                status: options.status || 'all',
                showDeceased: options.showDeceased || false,
                location: options.locationFilter || 'all',
                ageMin: options.ageMin || null,
                ageMax: options.ageMax || null
            },
            preset: options.preset || null
        });
        return;
    }
    
    if (typeof window.openCharacterSelector === 'function') {
        window.openCharacterSelector({
            title: title || 'Select Character',
            targetId: options.targetId || null,
            onSelect: onSelect,
            filters: {
                gender: options.gender || 'all',
                status: options.status || 'all',
                showDeceased: options.showDeceased || false,
                location: options.locationFilter || 'all'
            },
            preset: options.preset || null
        });
        return;
    }
    
    _showToast('Character selector not available', 'error');
}

// =============================================================================
// 6. CREATE FRIENDSHIP MODAL
// =============================================================================

function openFriendshipModal(characters, onSuccess) {
    var chars = Array.isArray(characters) ? characters.filter(function(c) { return c && c.id; }) : [];
    
    if (chars.length < 2) {
        _showToast('At least 2 characters are required to create friendships', 'error');
        return;
    }
    
    var totalFriendships = (chars.length * (chars.length - 1)) / 2;
    var currentYear = _getCurrentYear();
    
    var createdFriendships = [];
    var existingFriendships = [];
    var validPairs = [];
    
    for (var i = 0; i < chars.length; i++) {
        for (var j = i + 1; j < chars.length; j++) {
            var existing = _findFriendship(chars[i], chars[j]);
            if (existing) {
                existingFriendships.push({ char1: chars[i], char2: chars[j], friendship: existing });
            } else {
                validPairs.push({ char1: chars[i], char2: chars[j] });
            }
        }
    }
    
    var personIcon = _getIcon('PERSON');
    var locationIcon = _getIcon('LOCATION');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var warningIcon = _getIcon('WARNING');
    
    var charsHtml = '';
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        var age = _calculateAge(c.birthYear, c.isDeceased, c.deathYear);
        var rank = _getActiveRankDisplay(c);
        var location = _getCurrentLocation(c);
        var rankText = rank ? '<span style="color: var(--accent);">' + _escapeHtml(rank.display) + '</span> ' : '';
        charsHtml += `
            <div style="padding: 8px 0; border-bottom: 1px solid var(--border2);">
                ${rankText}
                <strong>${_escapeHtml(c.name)} ${_escapeHtml(c.surname || '')}</strong>
                (${age}y, ${c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚧')}, ${locationIcon} ${_escapeHtml(location)})
            </div>
        `;
    }
    
    var existingWarning = '';
    if (existingFriendships.length > 0) {
        existingWarning = `
            <div class="warning-box" style="background: rgba(200, 112, 64, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 10px; margin-bottom: 16px;">
                ${warningIcon} ${existingFriendships.length} existing friendship(s) detected. Only new friendships will be created.
                ${existingFriendships.map(function(f) { return '<div style="font-size: 0.6rem;">• ' + f.char1.name + ' & ' + f.char2.name + ' (friends since ' + (f.friendship.startYear || '?') + ')</div>'; }).join('')}
            </div>
        `;
    }
    
    if (validPairs.length === 0) {
        _showToast('All ' + chars.length + ' characters are already friends with each other', 'info');
        if (onSuccess) onSuccess();
        return;
    }
    
    var modalContent = `
        <div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: var(--accent);">Selected Characters (${chars.length}):</div>
            ${charsHtml}
            <div class="info-note" style="margin-top: 8px; padding: 6px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem;">
                ${infoIcon} This will create ${validPairs.length} new friendship(s) between all selected pairs
            </div>
        </div>
        ${existingWarning}
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Friendship Start Year</label>
            <input type="number" id="friendshipStartYear" value="${currentYear}" min="1" max="${currentYear + 10}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            <small style="font-size: 0.55rem; color: var(--dim);">Leave empty for current year</small>
        </div>
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Notes (optional)</label>
            <textarea id="friendshipNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="How did they meet?"></textarea>
        </div>
    `;
    
    _openModal({
        title: infoIcon + ' Create Friendships',
        content: modalContent,
        confirmText: _getIcon('CHECK_SIMPLE') + ' Create ' + validPairs.length + ' Friendship' + (validPairs.length !== 1 ? 's' : ''),
        cancelText: 'Cancel',
        onConfirm: function() {
            var startYearInput = document.getElementById('friendshipStartYear').value;
            var startYear = startYearInput ? parseInt(startYearInput, 10) : currentYear;
            var notes = document.getElementById('friendshipNotes')?.value || '';
            
            if (isNaN(startYear) || startYear < 1) {
                _showToast('Please enter a valid year', 'error');
                return;
            }
            if (startYear > currentYear + 10) {
                _showToast('Year cannot exceed ' + (currentYear + 10), 'error');
                return;
            }
            
            var pairsFormed = 0;
            createdFriendships = [];
            
            for (var i = 0; i < validPairs.length; i++) {
                var pair = validPairs[i];
                var result = _createFriendship(pair.char1.id, pair.char2.id, {
                    startYear: startYear,
                    notes: notes || null,
                    strength: 50
                });
                if (result) {
                    pairsFormed++;
                    createdFriendships.push({
                        id: result.id || result,
                        charA: pair.char1.id,
                        charB: pair.char2.id,
                        charAName: pair.char1.name,
                        charBName: pair.char2.name,
                        startYear: startYear,
                        notes: notes
                    });
                }
            }
            
            if (pairsFormed > 0) {
                _saveMasterData();
                _showToast(_getIcon('CHECK_SIMPLE') + ' Created ' + pairsFormed + ' friendship pair(s)!', 'success');
                
                _showUndoPrompt(
                    'Created ' + pairsFormed + ' friendship(s)',
                    function() {
                        var undoneCount = 0;
                        for (var i = 0; i < createdFriendships.length; i++) {
                            var f = createdFriendships[i];
                            if (_removeFriendship(f.charA, f.charB, { endYear: startYear })) {
                                undoneCount++;
                            }
                        }
                        _saveMasterData();
                        _showToast(_getIcon('CIRCLE_DOT') + ' Undid creation of ' + undoneCount + ' friendship(s)', 'info');
                    },
                    function() {
                        var redoneCount = 0;
                        for (var i = 0; i < createdFriendships.length; i++) {
                            var f = createdFriendships[i];
                            var result = _createFriendship(f.charA, f.charB, {
                                startYear: f.startYear,
                                notes: f.notes,
                                strength: 50
                            });
                            if (result) redoneCount++;
                        }
                        _saveMasterData();
                        _showToast(_getIcon('CIRCLE_DOT') + ' Redid creation of ' + redoneCount + ' friendship(s)', 'info');
                    }
                );
            } else {
                _showToast('No new friendships created.', 'info');
            }
            
            if (onSuccess) onSuccess();
        }
    });
}

// =============================================================================
// 7. EDIT FRIENDSHIP MODAL
// =============================================================================

function openEditFriendshipModal(charId1, charId2, onSuccess) {
    var char1 = _getCharacterById(charId1);
    var char2 = _getCharacterById(charId2);
    var currentYear = _getCurrentYear();
    
    if (!char1 || !char2) {
        _showToast('Character not found', 'error');
        return;
    }
    
    var friendship = _findFriendship(char1, char2);
    
    if (!friendship) {
        _showToast('No friendship found between ' + char1.name + ' and ' + char2.name, 'error');
        return;
    }
    
    var startYear = friendship.startYear || currentYear;
    var notes = friendship.notes || friendship.metadata?.notes || '';
    var strength = _getFriendshipStrength(charId1, charId2) || 50;
    var status = friendship.status || 'ongoing';
    
    var strengthPercent = strength + '%';
    var strengthColor = '#4a9060';
    if (strength < 30) strengthColor = '#c84444';
    else if (strength < 60) strengthColor = '#c8a844';
    else strengthColor = '#4a9060';
    
    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    
    var modalContent = `
        <div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">
            <strong>${_escapeHtml(char1.name)}</strong> ${infoIcon} <strong>${_escapeHtml(char2.name)}</strong>
            <div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">Friends since ${startYear || '?'}</div>
            <div style="margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.6rem; margin-bottom: 4px;">
                    <span>${infoIcon} Friendship Strength</span>
                    <span style="color: ${strengthColor};">${strengthPercent}</span>
                </div>
                <div class="progress-bar" style="background: var(--bg3); border-radius: 4px; height: 6px;">
                    <div class="progress-fill" style="background: ${strengthColor}; height: 100%; width: ${strength}%; border-radius: 4px;"></div>
                </div>
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>
            <input type="number" id="editFriendshipStartYear" value="${startYear || currentYear}" min="1" max="${currentYear + 10}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Friendship Strength</label>
            <input type="range" id="editFriendshipStrength" min="0" max="100" value="${strength}" step="1" style="width: 100%;">
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                <span>0</span>
                <span id="strengthDisplay">${strength}%</span>
                <span>100</span>
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Status</label>
            <select id="editFriendshipStatus" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                <option value="ongoing" ${status !== 'ended' ? 'selected' : ''}>${infoIcon} Active</option>
                <option value="ended" ${status === 'ended' ? 'selected' : ''}>${_getIcon('X_HEAVY')} Ended</option>
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>
            <textarea id="editFriendshipNotes" rows="3" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">${_escapeHtml(notes)}</textarea>
        </div>
        
        <div class="action-buttons" style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">
            <button id="endFriendshipBtn" class="btn danger" style="background: #8a3020; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">${_getIcon('X_HEAVY')} End Friendship</button>
        </div>
    `;
    
    _openModal({
        title: _getIcon('EDIT') + ' Edit Friendship: ' + char1.name + ' & ' + char2.name,
        content: modalContent,
        confirmText: _getIcon('CHECK_SIMPLE') + ' Save Changes',
        cancelText: 'Cancel',
        onConfirm: function() {
            var newStartYear = parseInt(document.getElementById('editFriendshipStartYear').value);
            var newStrength = parseInt(document.getElementById('editFriendshipStrength').value);
            var newStatus = document.getElementById('editFriendshipStatus').value;
            var newNotes = document.getElementById('editFriendshipNotes').value;
            
            if (isNaN(newStartYear)) {
                _showToast('Invalid start year', 'error');
                return;
            }
            
            if (isNaN(newStrength) || newStrength < 0 || newStrength > 100) {
                _showToast('Invalid strength value', 'error');
                return;
            }
            
            var success = true;
            
            if (newStatus === 'ended' && status !== 'ended') {
                success = _removeFriendship(charId1, charId2, {
                    endYear: newStartYear,
                    reason: 'Edited'
                });
            } else {
                // Update using the friendship object
                if (friendship.startYear !== undefined) friendship.startYear = newStartYear;
                if (friendship.notes !== undefined) friendship.notes = newNotes || null;
                if (friendship.status !== undefined) friendship.status = newStatus;
                if (!friendship.metadata) friendship.metadata = {};
                friendship.metadata.notes = newNotes || null;
                friendship.metadata.strength = newStrength;
                
                // Update strength
                var currentStrength = _getFriendshipStrength(charId1, charId2);
                if (newStrength > currentStrength) {
                    _increaseFriendshipStrength(charId1, charId2, newStrength - currentStrength);
                } else if (newStrength < currentStrength) {
                    _decreaseFriendshipStrength(charId1, charId2, currentStrength - newStrength);
                }
                
                _saveMasterData();
            }
            
            if (success) {
                _saveMasterData();
                _showToast(_getIcon('CHECK_SIMPLE') + ' Updated friendship between ' + char1.name + ' and ' + char2.name, 'success');
                if (onSuccess) onSuccess();
            } else {
                _showToast('Failed to update friendship', 'error');
            }
        }
    });
    
    setTimeout(function() {
        var strengthSlider = document.getElementById('editFriendshipStrength');
        var strengthDisplay = document.getElementById('strengthDisplay');
        if (strengthSlider && strengthDisplay) {
            strengthSlider.addEventListener('input', function() {
                strengthDisplay.textContent = strengthSlider.value + '%';
            });
        }
        
        var endBtn = document.getElementById('endFriendshipBtn');
        if (endBtn) {
            endBtn.addEventListener('click', function() {
                _closeTopModal();
                openBreakupFriendshipModal(charId1, charId2, function() {
                    if (onSuccess) onSuccess();
                });
            });
        }
    }, 100);
}

// =============================================================================
// 8. BREAKUP/END FRIENDSHIP MODAL
// =============================================================================

function openBreakupFriendshipModal(charId1, charId2, onSuccess) {
    var char1 = _getCharacterById(charId1);
    var char2 = _getCharacterById(charId2);
    var currentYear = _getCurrentYear();
    
    if (!char1 || !char2) {
        _showToast('Character not found', 'error');
        return;
    }
    
    var friendship = _findFriendship(char1, char2);
    
    if (!friendship) {
        _showToast('No friendship found between ' + char1.name + ' and ' + char2.name, 'error');
        return;
    }
    
    var startYear = friendship.startYear || currentYear;
    var friendshipDuration = currentYear - startYear;
    var strength = _getFriendshipStrength(charId1, charId2) || 50;
    
    if (friendship.status === 'ended') {
        _showToast('This friendship has already ended', 'info');
        return;
    }
    
    var mutualFriends = _getMutualFriends(charId1, charId2);
    var mutualFriendsWarning = '';
    if (mutualFriends && mutualFriends.length > 0) {
        mutualFriendsWarning = `
            <div class="warning-box" style="background: rgba(200, 112, 64, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 10px; margin-bottom: 16px;">
                ${_getIcon('WARNING')} <strong>Warning:</strong> These characters have ${mutualFriends.length} mutual friend(s).<br>
                Ending this friendship may affect their social circle.
                <div style="font-size: 0.6rem; margin-top: 4px;">${mutualFriends.slice(0, 5).map(function(f) { return '• ' + f.name; }).join(' ')}${mutualFriends.length > 5 ? ' and ' + (mutualFriends.length - 5) + ' more' : ''}</div>
            </div>
        `;
    }
    
    var reasonOptions = '';
    for (var key in FRIENDSHIP_REASONS) {
        if (FRIENDSHIP_REASONS.hasOwnProperty(key)) {
            var info = FRIENDSHIP_REASONS[key];
            reasonOptions += '<option value="' + key + '">' + info.label + ' - ' + info.description + '</option>';
        }
    }
    
    var modalContent = `
        <div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">
            <strong>${_escapeHtml(char1.name)}</strong> ${_getIcon('CIRCLE_DOT')} <strong>${_escapeHtml(char2.name)}</strong>
            <div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">Friends since ${startYear} (${friendshipDuration} years)</div>
            <div style="font-size: 0.6rem; color: var(--dim);">Friendship strength: ${strength}%</div>
        </div>
        
        ${mutualFriendsWarning}
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">End Year</label>
            <input type="number" id="breakupFriendshipYear" value="${currentYear}" min="${startYear}" max="${currentYear + 5}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            <small style="font-size: 0.55rem;">Must be ${startYear} or later</small>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason for Ending</label>
            <select id="breakupFriendshipReason" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                ${reasonOptions}
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>
            <textarea id="breakupFriendshipNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="What happened?"></textarea>
        </div>
        
        <div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem;">
            ${_getIcon('CIRCLE_DOT')} Ending a friendship will remove it from both characters' friend lists and may affect their social standing.
        </div>
    `;
    
    _openModal({
        title: _getIcon('X_HEAVY') + ' End Friendship: ' + char1.name + ' & ' + char2.name,
        content: modalContent,
        confirmText: _getIcon('X_HEAVY') + ' Confirm End Friendship',
        cancelText: 'Cancel',
        onConfirm: function() {
            var endYear = parseInt(document.getElementById('breakupFriendshipYear').value);
            var reason = document.getElementById('breakupFriendshipReason').value;
            var notes = document.getElementById('breakupFriendshipNotes')?.value || '';
            
            if (isNaN(endYear)) {
                _showToast('Please enter a valid year', 'error');
                return;
            }
            
            if (endYear < startYear) {
                _showToast('End year cannot be before the friendship started (' + startYear + ')', 'error');
                return;
            }
            
            var success = _removeFriendship(charId1, charId2, {
                endYear: endYear,
                reason: reason,
                notes: notes || null
            });
            
            if (success) {
                _saveMasterData();
                
                var reasonInfo = FRIENDSHIP_REASONS[reason] || FRIENDSHIP_REASONS.other;
                _showToast(_getIcon('X_HEAVY') + ' ' + char1.name + ' and ' + char2.name + ' are no longer friends (' + reasonInfo.label + ')', 'info');
                
                _closeTopModal();
                if (onSuccess) onSuccess();
            } else {
                _showToast('Failed to end friendship', 'error');
            }
        }
    });
}

// =============================================================================
// 9. VIEW FRIENDSHIP MODAL
// =============================================================================

function openViewFriendshipModal(charId1, charId2, onEdit) {
    var char1 = _getCharacterById(charId1);
    var char2 = _getCharacterById(charId2);
    var currentYear = _getCurrentYear();
    
    if (!char1 || !char2) {
        _showToast('Character not found', 'error');
        return;
    }
    
    var friendship = _findFriendship(char1, char2);
    
    if (!friendship) {
        _showToast('No friendship found between ' + char1.name + ' and ' + char2.name, 'error');
        return;
    }
    
    var startYear = friendship.startYear || '?';
    var duration = startYear !== '?' ? currentYear - startYear : '?';
    var strength = _getFriendshipStrength(charId1, charId2) || 50;
    var status = friendship.status || 'active';
    var statusIcon = status === 'active' ? _getIcon('CIRCLE_DOT') + ' Active' : _getIcon('X_HEAVY') + ' Ended';
    var statusColor = status === 'active' ? '#4a9060' : '#c84444';
    var notes = friendship.notes || friendship.metadata?.notes || '';
    
    var strengthColor = '#4a9060';
    if (strength < 30) strengthColor = '#c84444';
    else if (strength < 60) strengthColor = '#c8a844';
    else strengthColor = '#4a9060';
    
    var endInfo = '';
    var endYear = friendship.endYear || friendship.metadata?.endYear;
    var endReason = friendship.endReason || friendship.metadata?.endReason;
    if (endYear) {
        var reasonInfo = endReason ? FRIENDSHIP_REASONS[endReason] : null;
        var reasonText = reasonInfo ? reasonInfo.label : endReason;
        endInfo = `
            <div class="form-group" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                <label style="display: block; font-size: 0.7rem; color: var(--warn); margin-bottom: 4px;">Ended</label>
                <div class="info-value" style="font-size: 0.7rem;">${endYear} · ${reasonText || 'No reason given'}</div>
            </div>
        `;
    }
    
    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    
    var modalContent = `
        <div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 12px;">
                <span style="font-size: 2rem;">${_getIcon('FRIENDSHIP')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div><strong>${_escapeHtml(char1.name)}</strong><br><span style="font-size: 0.6rem; color: var(--dim);">${_calculateAge(char1.birthYear, char1.isDeceased, char1.deathYear)}y</span></div>
                <span style="color: var(--accent); font-size: 1.5rem;">${_getIcon('CIRCLE_DOT')}</span>
                <div style="text-align: right;"><strong>${_escapeHtml(char2.name)}</strong><br><span style="font-size: 0.6rem; color: var(--dim);">${_calculateAge(char2.birthYear, char2.isDeceased, char2.deathYear)}y</span></div>
            </div>
            <div style="margin-top: 12px; text-align: center;">
                <span style="background: ${statusColor}; padding: 2px 8px; border-radius: 12px; font-size: 0.6rem; color: white;">${statusIcon}</span>
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Friends Since</label>
            <div class="info-value" style="font-size: 0.7rem;">${startYear} ${duration !== '?' ? '(' + duration + ' years ago)' : ''}</div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Friendship Strength</label>
            <div style="margin-top: 4px;">
                <div class="progress-bar" style="background: var(--bg3); border-radius: 4px; height: 8px;">
                    <div class="progress-fill" style="background: ${strengthColor}; height: 100%; width: ${strength}%; border-radius: 4px;"></div>
                </div>
                <div style="font-size: 0.65rem; margin-top: 4px; color: ${strengthColor};">${strength}%</div>
            </div>
        </div>
        
        ${notes ? `
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Notes</label>
            <div class="info-value" style="font-size: 0.7rem; background: var(--bg3); padding: 8px; border-radius: 6px;">${_escapeHtml(notes)}</div>
        </div>
        ` : ''}
        
        ${endInfo}
        
        <div class="action-buttons" style="margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;">
            <button id="editFriendshipFromViewBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">${_getIcon('EDIT')} Edit</button>
            ${status === 'active' ? `<button id="endFriendshipFromViewBtn" class="btn danger" style="background: #8a3020; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">${_getIcon('X_HEAVY')} End Friendship</button>` : ''}
        </div>
    `;
    
    _openModal({
        title: _getIcon('FRIENDSHIP') + ' Friendship Details: ' + char1.name + ' & ' + char2.name,
        content: modalContent,
        confirmText: 'Close',
        cancelText: '',
        onConfirm: function() {}
    });
    
    setTimeout(function() {
        var editBtn = document.getElementById('editFriendshipFromViewBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                _closeTopModal();
                openEditFriendshipModal(charId1, charId2, function() {
                    if (onEdit) onEdit();
                });
            });
        }
        
        var endBtn = document.getElementById('endFriendshipFromViewBtn');
        if (endBtn) {
            endBtn.addEventListener('click', function() {
                _closeTopModal();
                openBreakupFriendshipModal(charId1, charId2, function() {
                    if (onEdit) onEdit();
                });
            });
        }
    }, 100);
}

// =============================================================================
// 10. FRIEND RECOMMENDATIONS MODAL
// =============================================================================

function openFriendRecommendationsModal(characterId, onSelect) {
    var character = _getCharacterById(characterId);
    if (!character) {
        _showToast('Character not found', 'error');
        return;
    }
    
    var allChars = _getCharacters();
    var currentYear = _getCurrentYear();
    var characterAge = _calculateAge(character.birthYear, false, null);
    var characterLocation = _getCurrentLocation(character);
    var characterProfessions = character.professions ? character.professions.map(function(p) { return p.id; }) : [];
    
    var existingFriendIds = new Set();
    var friends = _getFriends(characterId);
    for (var i = 0; i < friends.length; i++) {
        existingFriendIds.add(friends[i].id);
    }
    
    var recommendations = [];
    var personIcon = _getIcon('PERSON');
    var locationIcon = _getIcon('LOCATION');
    var infoIcon = _getIcon('CIRCLE_DOT');
    
    for (var i = 0; i < allChars.length; i++) {
        var candidate = allChars[i];
        if (candidate.id === characterId) continue;
        if (candidate.isDeceased) continue;
        if (existingFriendIds.has(candidate.id)) continue;
        
        var score = 0;
        var reasons = [];
        
        var candidateLocation = _getCurrentLocation(candidate);
        if (candidateLocation === characterLocation) {
            score += 30;
            reasons.push(locationIcon + ' Lives in same location');
        } else {
            score += 5;
            reasons.push(infoIcon + ' Different location');
        }
        
        var candidateAge = _calculateAge(candidate.birthYear, false, null);
        var ageGap = Math.abs(characterAge - candidateAge);
        if (ageGap <= 5) {
            score += 25;
            reasons.push('◉ Similar age (within 5 years)');
        } else if (ageGap <= 10) {
            score += 15;
            reasons.push(infoIcon + ' Close in age');
        } else if (ageGap <= 20) {
            score += 5;
            reasons.push(infoIcon + ' Age difference acceptable');
        } else {
            reasons.push(infoIcon + ' Large age gap');
        }
        
        var candidateProfessions = candidate.professions ? candidate.professions.map(function(p) { return p.id; }) : [];
        var sharedProfessions = [];
        for (var j = 0; j < characterProfessions.length; j++) {
            if (candidateProfessions.indexOf(characterProfessions[j]) !== -1) {
                sharedProfessions.push(characterProfessions[j]);
            }
        }
        if (sharedProfessions.length > 0) {
            score += sharedProfessions.length * 15;
            reasons.push('◉ Shared ' + sharedProfessions.length + ' profession(s)');
        }
        
        var mutualFriendCount = 0;
        var candidateFriends = _getFriends(candidate.id);
        for (var j = 0; j < candidateFriends.length; j++) {
            if (existingFriendIds.has(candidateFriends[j].id)) {
                mutualFriendCount++;
            }
        }
        if (mutualFriendCount > 0) {
            score += mutualFriendCount * 10;
            reasons.push('👥 ' + mutualFriendCount + ' mutual friend(s)');
        }
        
        if (character.gender === candidate.gender) {
            score += 5;
            reasons.push('⚥ Same gender');
        }
        
        var characterRank = _getActiveRankDisplay(character)?.priority || 5;
        var candidateRank = _getActiveRankDisplay(candidate)?.priority || 5;
        if (Math.abs(characterRank - candidateRank) <= 1) {
            score += 10;
            reasons.push('◉ Similar social standing');
        }
        
        var compatibility = Math.min(95, Math.floor(score / 1.2));
        
        recommendations.push({
            character: candidate,
            score: score,
            compatibility: compatibility,
            reasons: reasons,
            age: candidateAge,
            location: candidateLocation,
            mutualFriends: mutualFriendCount,
            sharedProfessions: sharedProfessions.length,
            rank: _getActiveRankDisplay(candidate)
        });
    }
    
    recommendations.sort(function(a, b) { return b.score - a.score; });
    var topRecommendations = recommendations.slice(0, 15);
    
    if (topRecommendations.length === 0) {
        _showToast('No potential friends found', 'info');
        return;
    }
    
    function renderRecommendations() {
        var html = '';
        for (var i = 0; i < topRecommendations.length; i++) {
            var rec = topRecommendations[i];
            var compatibilityColor = rec.compatibility >= 70 ? '#4a9060' : (rec.compatibility >= 40 ? '#c8a844' : '#c84444');
            var rankIcon = rec.rank?.display ? rec.rank.display + ' ' : '';
            
            html += `
                <div class="recommendation-card" data-char-id="${rec.character.id}" style="
                    background: var(--bg3);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 10px;
                    cursor: pointer;
                    transition: all 0.1s;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                        <div>
                            <strong>${rankIcon}${_escapeHtml(rec.character.name)} ${_escapeHtml(rec.character.surname || '')}</strong>
                            <span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">${rec.age}y</span>
                            <span style="font-size: 0.55rem; color: var(--accent); margin-left: 8px;">${locationIcon} ${_escapeHtml(rec.location)}</span>
                        </div>
                        <div style="font-size: 0.65rem; font-weight: bold; color: ${compatibilityColor};">
                            ${infoIcon} ${rec.compatibility}% match
                        </div>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                        ${rec.reasons.slice(0, 3).map(function(r) { return '<span style="font-size: 0.55rem; background: var(--bg2); padding: 2px 6px; border-radius: 10px;">' + r + '</span>'; }).join('')}
                        ${rec.reasons.length > 3 ? '<span style="font-size: 0.55rem; color: var(--dim);">+' + (rec.reasons.length - 3) + ' more</span>' : ''}
                    </div>
                    <div class="action-buttons" style="display: flex; gap: 8px; margin-top: 8px;">
                        <button class="select-friend-btn btn small" style="background: var(--accent); color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer;">${infoIcon} Select</button>
                    </div>
                </div>
            `;
        }
        return html;
    }
    
    var modalContent = `
        <div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">
            <div><strong>◉ ${_escapeHtml(character.name)} ${_escapeHtml(character.surname || '')}</strong></div>
            <div style="font-size: 0.65rem; color: var(--dim);">${characterAge}y · ${locationIcon} ${_escapeHtml(characterLocation)}</div>
            <div style="font-size: 0.6rem; color: var(--accent); margin-top: 4px;">Found ${topRecommendations.length} potential friend(s)</div>
        </div>
        
        <div id="recommendationsList" style="max-height: 500px; overflow-y: auto;">
            ${renderRecommendations()}
        </div>
        
        <div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">
            ${infoIcon} Recommendations based on location, age, shared professions, mutual friends, and social standing.
        </div>
    `;
    
    _openModal({
        title: _getIcon('CIRCLE_DOT') + ' Friend Recommendations for ' + character.name,
        content: modalContent,
        confirmText: 'Close',
        cancelText: ''
    });
    
    setTimeout(function() {
        document.querySelectorAll('.recommendation-card, .select-friend-btn').forEach(function(el) {
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                var card = el.closest('.recommendation-card');
                if (card) {
                    var charId = card.dataset.charId;
                    var recommendedChar = _getCharacterById(charId);
                    if (recommendedChar && onSelect) {
                        onSelect(recommendedChar);
                        _closeTopModal();
                    }
                }
            });
        });
    }, 100);
}

// =============================================================================
// 11. GROUP FRIENDSHIP MODAL
// =============================================================================

var _friendGroups = [];

function openGroupFriendshipModal(characterIds, onSuccess) {
    var characters = (characterIds || [])
        .map(function(id) { return _getCharacterById(id); })
        .filter(function(c) { return c && !c.isDeceased; });
    
    if (characters.length < 2) {
        _showToast('At least 2 characters are required to form a group', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var createdGroupId = null;
    var createdGroupData = null;
    
    var existingGroups = new Set();
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (char.groups) {
            for (var j = 0; j < char.groups.length; j++) {
                existingGroups.add(char.groups[j].name);
            }
        }
    }
    
    var personIcon = _getIcon('PERSON');
    var locationIcon = _getIcon('LOCATION');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var warningIcon = _getIcon('WARNING');
    
    var charsHtml = '';
    for (var i = 0; i < characters.length; i++) {
        var c = characters[i];
        var age = _calculateAge(c.birthYear, false, null);
        var rank = _getActiveRankDisplay(c);
        var rankText = rank ? '<span style="color: var(--accent); font-size: 0.6rem;">' + _escapeHtml(rank.display) + '</span> ' : '';
        charsHtml += `
            <div style="padding: 6px 0; border-bottom: 1px solid var(--border-light);">
                ${rankText}
                <strong>${_escapeHtml(c.name)} ${_escapeHtml(c.surname || '')}</strong> (${age}y)
            </div>
        `;
    }
    
    var existingWarning = existingGroups.size > 0 ? `
        <div class="warning-box" style="background: rgba(200, 112, 64, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 10px; margin-bottom: 16px;">
            ${warningIcon} Note: Some characters already belong to groups. They can belong to multiple groups.
        </div>
    ` : '';
    
    var modalContent = `
        <div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: var(--accent);">Group Members (${characters.length}):</div>
            ${charsHtml}
        </div>
        ${existingWarning}
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Group Name *</label>
            <input type="text" id="groupName" placeholder="e.g., The Oxford Circle, Court Intrigue Club, Merchant Guild" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Group Icon</label>
            <input type="text" id="groupIcon" value="⌇" maxlength="2" style="width: 60px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            <small style="font-size: 0.55rem; color: var(--dim);">Single character (⌇, ◉, ⌂, ⚔, ⌆)</small>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Founding Year</label>
            <input type="number" id="groupFoundingYear" value="${currentYear}" min="1" max="${currentYear + 10}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Group Type</label>
            <select id="groupType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                <option value="social">${infoIcon} Social Circle</option>
                <option value="guild">◉ Guild / Professional</option>
                <option value="family">${locationIcon} Family</option>
                <option value="political">${_getIcon('SWORD')} Political Faction</option>
                <option value="religious">⌆ Religious Order</option>
                <option value="academic">${infoIcon} Academic / Scholarly</option>
                <option value="military">${_getIcon('SWORD')} Military Unit</option>
                <option value="secret">${infoIcon} Secret Society</option>
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Group Leader (optional)</label>
            <select id="groupLeader" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                <option value="">— None —</option>
                ${characters.map(function(c) { return '<option value="' + c.id + '">' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</option>'; }).join('')}
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>
            <textarea id="groupDescription" rows="3" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="What is this group about?"></textarea>
        </div>
        
        <div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">
            ${infoIcon} Groups help track social circles and affiliations. Members can belong to multiple groups.
        </div>
    `;
    
    _openModal({
        title: infoIcon + ' Create Friend Group',
        content: modalContent,
        confirmText: _getIcon('CHECK_SIMPLE') + ' Create Group',
        cancelText: 'Cancel',
        onConfirm: function() {
            var groupName = document.getElementById('groupName')?.value.trim();
            if (!groupName) {
                _showToast('Group name is required', 'error');
                return;
            }
            
            var groupIcon = document.getElementById('groupIcon')?.value || '⌇';
            var foundingYear = parseInt(document.getElementById('groupFoundingYear')?.value);
            var groupType = document.getElementById('groupType')?.value;
            var groupLeaderId = document.getElementById('groupLeader')?.value || null;
            var description = document.getElementById('groupDescription')?.value || '';
            
            if (isNaN(foundingYear)) foundingYear = currentYear;
            
            var groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
            var groupData = {
                id: groupId,
                name: groupName,
                icon: groupIcon,
                type: groupType,
                foundingYear: foundingYear,
                leaderId: groupLeaderId,
                description: description,
                members: characters.map(function(c) { return {
                    characterId: c.id,
                    joinedYear: foundingYear,
                    role: c.id === groupLeaderId ? 'leader' : 'member'
                }; }),
                createdAt: currentYear
            };
            
            createdGroupData = groupData;
            
            var successCount = 0;
            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (!char.groups) char.groups = [];
                var existing = null;
                for (var j = 0; j < char.groups.length; j++) {
                    if (char.groups[j].name === groupName) {
                        existing = char.groups[j];
                        break;
                    }
                }
                if (!existing) {
                    char.groups.push({
                        id: groupId,
                        name: groupName,
                        icon: groupIcon,
                        type: groupType,
                        joinedYear: foundingYear,
                        role: char.id === groupLeaderId ? 'leader' : 'member'
                    });
                    successCount++;
                }
            }
            
            if (successCount > 0) {
                if (!window._friendGroups) window._friendGroups = [];
                window._friendGroups.push(groupData);
                
                _saveMasterData();
                _showToast(_getIcon('CHECK_SIMPLE') + ' Created group "' + groupName + '" with ' + successCount + ' members', 'success');
                
                _showUndoPrompt(
                    'Created group "' + groupName + '"',
                    function() {
                        for (var i = 0; i < characters.length; i++) {
                            var char = characters[i];
                            if (char.groups) {
                                char.groups = char.groups.filter(function(g) { return g.id !== groupId; });
                            }
                        }
                        if (window._friendGroups) {
                            window._friendGroups = window._friendGroups.filter(function(g) { return g.id !== groupId; });
                        }
                        _saveMasterData();
                        _showToast(_getIcon('CIRCLE_DOT') + ' Undid group creation', 'info');
                    },
                    function() {
                        for (var i = 0; i < characters.length; i++) {
                            var char = characters[i];
                            if (!char.groups) char.groups = [];
                            var existing = null;
                            for (var j = 0; j < char.groups.length; j++) {
                                if (char.groups[j].name === groupName) {
                                    existing = char.groups[j];
                                    break;
                                }
                            }
                            if (!existing) {
                                char.groups.push({
                                    id: groupId,
                                    name: groupName,
                                    icon: groupIcon,
                                    type: groupType,
                                    joinedYear: foundingYear,
                                    role: char.id === groupLeaderId ? 'leader' : 'member'
                                });
                            }
                        }
                        if (window._friendGroups) window._friendGroups.push(groupData);
                        _saveMasterData();
                        _showToast(_getIcon('CIRCLE_DOT') + ' Redid group creation', 'info');
                    }
                );
                
                if (onSuccess) onSuccess(groupData);
                _closeTopModal();
            } else {
                _showToast('Failed to create group', 'error');
            }
        }
    });
}

// =============================================================================
// 12. GROUP QUERY HELPERS
// =============================================================================

function getCharacterGroups(characterId) {
    var character = _getCharacterById(characterId);
    if (!character || !character.groups) return [];
    return character.groups;
}

function getGroupMembers(groupId) {
    var allChars = _getCharacters();
    var members = [];
    for (var i = 0; i < allChars.length; i++) {
        var char = allChars[i];
        if (char.groups && char.groups.some(function(g) { return g.id === groupId; })) {
            members.push(char);
        }
    }
    return members;
}

function getAllGroups() {
    return window._friendGroups || [];
}

// =============================================================================
// 13. EXPORTS
// =============================================================================

window.FRIENDSHIP_REASONS = FRIENDSHIP_REASONS;
window.openFriendshipModal = openFriendshipModal;
window.openEditFriendshipModal = openEditFriendshipModal;
window.openBreakupFriendshipModal = openBreakupFriendshipModal;
window.openViewFriendshipModal = openViewFriendshipModal;
window.openFriendRecommendationsModal = openFriendRecommendationsModal;
window.openGroupFriendshipModal = openGroupFriendshipModal;
window.getCharacterGroups = getCharacterGroups;
window.getGroupMembers = getGroupMembers;
window.getAllGroups = getAllGroups;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FRIENDSHIP_REASONS: FRIENDSHIP_REASONS,
        openFriendshipModal: openFriendshipModal,
        openEditFriendshipModal: openEditFriendshipModal,
        openBreakupFriendshipModal: openBreakupFriendshipModal,
        openViewFriendshipModal: openViewFriendshipModal,
        openFriendRecommendationsModal: openFriendRecommendationsModal,
        openGroupFriendshipModal: openGroupFriendshipModal,
        getCharacterGroups: getCharacterGroups,
        getGroupMembers: getGroupMembers,
        getAllGroups: getAllGroups
    };
}