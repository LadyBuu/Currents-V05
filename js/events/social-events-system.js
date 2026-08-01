/**
 * =============================================================================
 * STILL WATERS - SOCIAL EVENT SYSTEM (systems/world/core/socialEventSystem.js)
 * =============================================================================
 * 
 * This file orchestrates social events using existing canonical systems.
 * It is a THIN FACADE that delegates to the single-source-of-truth modules.
 * 
 * DEPENDENCIES (all canonical sources - no duplication):
 *   - accessors.js: getCharacterById, getCharacters, getPlaceById
 *   - time.js: calculateAge, getCurrentYearSafe
 *   - randomness.js: chance, pickRandom, randomInt
 *   - ui.js: showToast
 *   - modals-core.js: openModal, closeTopModal, _getIcon
 *   - romance-logic.js: startCasualDating, startCommittedRelationship, marryCharacters, breakup
 *   - friendship-logic.js: createFriendship, areFriends
 *   - professional-logic.js: createApprenticeship
 *   - jealousy-system.js: createRivalry, triggerConfrontation
 *   - location-commands.js: recordMove
 *   - character-commands.js: addProfession
 *   - eventLogger.js: logEvent
 *   - icons.js: Icons
 * 
 * ICON POLICY: 
 *   - All icons from icons.js via _getIcon()
 *   - NO icons in text fields or confirm buttons
 *   - Descriptions are plain text only
 * 
 * =============================================================================
 */

// =============================================================================
// 1. SOCIAL EVENT CONSTANTS (Plain text - no icons)
// =============================================================================

const SOCIAL_EVENT_CATEGORIES = [
    {
        name: "Romantic Events",
        iconKey: "HEART",
        events: [
            { 
                id: "new_casual_romance", 
                name: "Casual Dating", 
                desc: "Two characters start casually dating", 
                requiresTwo: true, 
                minAge: 14 
            },
            { 
                id: "new_committed", 
                name: "Committed Relationship", 
                desc: "Two characters enter a committed relationship", 
                requiresTwo: true, 
                minAge: 16 
            },
            { 
                id: "marriage", 
                name: "Marriage", 
                desc: "Two characters get married", 
                requiresTwo: true, 
                minAge: 16, 
                requiresRelationship: true 
            },
            { 
                id: "breakup", 
                name: "Breakup", 
                desc: "A couple ends their relationship", 
                requiresTwo: true, 
                requiresExistingRelationship: true, 
                requiresConfirmation: true 
            }
        ]
    },
    {
        name: "Social Events",
        iconKey: "FRIENDSHIP",
        events: [
            { 
                id: "new_friendship", 
                name: "New Friendship", 
                desc: "Two characters become friends", 
                requiresTwo: true, 
                minAge: 5 
            },
            { 
                id: "fight", 
                name: "Fight", 
                desc: "Two characters get into a physical fight", 
                requiresTwo: true, 
                minAge: 7 
            },
            { 
                id: "rivalry", 
                name: "Rivalry", 
                desc: "Two characters become rivals", 
                requiresTwo: true, 
                minAge: 10 
            },
            { 
                id: "moving_day", 
                name: "Moving Day", 
                desc: "A character relocates", 
                requiresOne: true 
            }
        ]
    },
    {
        name: "Professional Events",
        iconKey: "GEAR",
        events: [
            { 
                id: "new_role", 
                name: "New Role", 
                desc: "A character gains a new role or profession", 
                requiresOne: true 
            },
            { 
                id: "apprenticeship", 
                name: "Apprenticeship", 
                desc: "A character becomes an apprentice", 
                requiresTwo: true, 
                minAge: 7 
            }
        ]
    }
];

// =============================================================================
// 2. DEPENDENCY WRAPPERS (Thin wrappers to canonical sources)
// =============================================================================

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    const currentYear = typeof window.getCurrentYearSafe === 'function' 
        ? window.getCurrentYearSafe() 
        : 1250;
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
    if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
    return 1250;
}

function _chance(probability) {
    if (typeof window.chance === 'function') return window.chance(probability);
    return Math.random() < probability;
}

function _pickRandom(array) {
    if (typeof window.pickRandom === 'function') return window.pickRandom(array);
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

function _randomInt(min, max) {
    if (typeof window.randomInt === 'function') return window.randomInt(min, max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _logEvent(category, type, message, subjects) {
    if (typeof window.logEvent === 'function') {
        window.logEvent(category, type, message, subjects);
    }
}

function _showToast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type);
}

function _openModal(options) {
    if (typeof window.openModal === 'function') return window.openModal(options);
    _showToast('Modal system not available', 'error');
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') window.closeTopModal();
}

// =============================================================================
// FIXED: _getIcon - No recursive calls to avoid infinite loop
// =============================================================================

function _getIcon(name) {
    // Direct access only - no recursive window._getIcon check
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    // Fallback to emoji if icon not found
    const fallbackIcons = {
        'HEART': '❤️',
        'FRIENDSHIP': '🤝',
        'GEAR': '⚙️',
        'WARNING': '⚠️',
        'CIRCLE': '◉',
        'EDIT': '✏️',
        'PERSON': '👤',
        'X_HEAVY': '✖',
        'PLUS': '➕'
    };
    return fallbackIcons[name] || '';
}

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// =============================================================================
// 3. RELATIONSHIP HELPERS (Using canonical systems)
// =============================================================================

function _hasActiveRomanticRelationship(characterId) {
    if (typeof window.hasActiveRomanticRelationship === 'function') {
        return window.hasActiveRomanticRelationship(characterId);
    }
    return false;
}

function _getActiveRomanticRelationships(characterId) {
    if (typeof window.getActiveRomanticRelationships === 'function') {
        return window.getActiveRomanticRelationships(characterId);
    }
    return [];
}

function _isCharacterAvailableForRomance(characterId) {
    if (typeof window.canHaveMultiplePartners === 'function') {
        return window.canHaveMultiplePartners(characterId);
    }
    return !_hasActiveRomanticRelationship(characterId);
}

function _getRelationshipBetween(idA, idB) {
    if (typeof window.getRelationshipBetween === 'function') {
        return window.getRelationshipBetween(idA, idB);
    }
    return null;
}

function _areFriends(idA, idB) {
    if (typeof window.areFriends === 'function') {
        return window.areFriends(idA, idB);
    }
    return false;
}

// =============================================================================
// 4. CONFIRMATION MODAL
// =============================================================================

function _confirmBreakup(charA, charB, options, onConfirm) {
    const year = options.year || _getCurrentYear();
    const reason = options.reason || 'Relationship ended';
    const warningIcon = _getIcon('WARNING');
    
    const modalContent = `
        <div style="background: rgba(200, 112, 64, 0.15); border-left: 4px solid var(--warn); padding: 12px; margin-bottom: 16px; border-radius: 6px;">
            <strong style="color: var(--warn);">${warningIcon} Relationship Ending Event</strong>
        </div>
        
        <div class="info-box" style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div><strong>${_escapeHtml(charA?.name)}</strong> and <strong>${_escapeHtml(charB?.name)}</strong></div>
            <div><strong>Year of breakup:</strong> ${year}</div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>
            <input type="text" id="confirmBreakupReason" value="${_escapeHtml(reason)}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="confirmEndType" value="mutual">
                <span style="font-size: 0.7rem;">Mutual agreement (instead of unilateral breakup)</span>
            </label>
        </div>
        
        <div class="warning-box" style="background: rgba(200, 68, 68, 0.15); padding: 10px; border-radius: 6px;">
            <div style="font-size: 0.6rem;">This action cannot be undone.</div>
        </div>
    `;
    
    _openModal({
        title: 'Confirm Breakup',
        content: modalContent,
        confirmText: 'Confirm Breakup',
        cancelText: 'Cancel',
        onConfirm: function() {
            const finalReason = document.getElementById('confirmBreakupReason')?.value || reason;
            const isMutual = document.getElementById('confirmEndType')?.checked || false;
            
            onConfirm({
                ...options,
                reason: finalReason,
                endType: isMutual ? 'mutual' : 'breakup',
                endYear: year
            });
        }
    });
}

// =============================================================================
// 5. RANDOM CHARACTER SELECTION
// =============================================================================

function _getRandomEligibleCharacters(count, options) {
    options = options || {};
    const minAge = options.minAge || 0;
    const maxAge = options.maxAge || 150;
    const excludeIds = options.excludeIds || [];
    const requireAvailable = options.requireAvailable || false;
    
    const allChars = _getCharacters();
    const eligible = [];
    
    for (var i = 0; i < allChars.length; i++) {
        var c = allChars[i];
        if (c.isDeceased) continue;
        if (excludeIds.indexOf(c.id) !== -1) continue;
        
        var age = _calculateAge(c.birthYear, false, null);
        if (age < minAge) continue;
        if (age > maxAge) continue;
        
        if (requireAvailable && !_isCharacterAvailableForRomance(c.id)) continue;
        
        eligible.push(c);
    }
    
    // Shuffle
    for (var j = eligible.length - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var temp = eligible[j];
        eligible[j] = eligible[k];
        eligible[k] = temp;
    }
    
    return eligible.slice(0, count);
}

function _getRandomRomanticCouple() {
    const allChars = _getCharacters();
    const couples = [];
    
    for (var i = 0; i < allChars.length; i++) {
        var char = allChars[i];
        if (char.isDeceased) continue;
        
        var relationships = _getActiveRomanticRelationships(char.id);
        for (var j = 0; j < relationships.length; j++) {
            var rel = relationships[j];
            var partnerId = rel.participantA === char.id ? rel.participantB : rel.participantA;
            var partner = _getCharacterById(partnerId);
            if (partner && partner.id > char.id) {
                couples.push([char, partner]);
            }
        }
    }
    
    if (couples.length === 0) return null;
    return _pickRandom(couples);
}

function _getRandomFriends() {
    const allChars = _getCharacters();
    const friendships = [];
    
    for (var i = 0; i < allChars.length; i++) {
        var char = allChars[i];
        if (char.isDeceased) continue;
        
        var friends = typeof window.getFriends === 'function' 
            ? window.getFriends(char.id) 
            : [];
        
        for (var j = 0; j < friends.length; j++) {
            var friend = friends[j];
            if (friend && friend.id > char.id) {
                friendships.push([char, friend]);
            }
        }
    }
    
    if (friendships.length === 0) return null;
    return _pickRandom(friendships);
}

function _getRandomRivals() {
    // Use jealousy targets as rivals
    if (typeof window.findAllJealousyTargets === 'function') {
        const allChars = _getCharacters();
        const rivalries = [];
        
        for (var i = 0; i < allChars.length; i++) {
            var char = allChars[i];
            if (char.isDeceased) continue;
            
            var targets = window.findAllJealousyTargets(char.id);
            for (var j = 0; j < targets.length; j++) {
                var target = targets[j];
                if (target && target.target && target.target.id > char.id) {
                    rivalries.push([char, target.target]);
                }
            }
        }
        
        if (rivalries.length === 0) return null;
        return _pickRandom(rivalries);
    }
    
    return null;
}

// =============================================================================
// 6. SOCIAL EVENT MANAGEMENT
// =============================================================================

function getSocialEventCategories() {
    return SOCIAL_EVENT_CATEGORIES;
}

function getEventsByCategory(categoryName) {
    for (var i = 0; i < SOCIAL_EVENT_CATEGORIES.length; i++) {
        if (SOCIAL_EVENT_CATEGORIES[i].name === categoryName) {
            return SOCIAL_EVENT_CATEGORIES[i].events;
        }
    }
    return [];
}

function triggerSocialEvent(eventId, participants, options) {
    return _executeEventDirect(eventId, participants, options || {});
}

function triggerSocialEventWithConfirm(eventId, participants, options, onComplete) {
    options = options || {};
    
    var eventDef = null;
    for (var i = 0; i < SOCIAL_EVENT_CATEGORIES.length; i++) {
        var category = SOCIAL_EVENT_CATEGORIES[i];
        for (var j = 0; j < category.events.length; j++) {
            if (category.events[j].id === eventId) {
                eventDef = category.events[j];
                break;
            }
        }
        if (eventDef) break;
    }
    
    if (!eventDef) {
        var result = { success: false, error: 'Event "' + eventId + '" not found' };
        if (onComplete) onComplete(result);
        return result;
    }
    
    // Validate participants
    if (eventDef.requiresTwo && (!participants || participants.length < 2)) {
        var result = { success: false, error: 'Event requires at least 2 participants' };
        if (onComplete) onComplete(result);
        return result;
    }
    
    if (eventDef.requiresOne && (!participants || participants.length < 1)) {
        var result = { success: false, error: 'Event requires at least 1 participant' };
        if (onComplete) onComplete(result);
        return result;
    }
    
    // Check if event requires confirmation
    if (eventDef.requiresConfirmation) {
        var charA = participants[0] ? _getCharacterById(participants[0]) : null;
        var charB = participants[1] ? _getCharacterById(participants[1]) : null;
        
        if (eventId === 'breakup') {
            _confirmBreakup(charA, charB, options, function(confirmedOptions) {
                var result = _executeBreakup(participants[0], participants[1], confirmedOptions);
                if (onComplete) onComplete(result);
            });
            return { pending: true, message: 'Awaiting confirmation' };
        }
    }
    
    // For non-confirmation events, execute immediately
    var result = _executeEventDirect(eventId, participants, options);
    if (onComplete) onComplete(result);
    return result;
}

function _executeEventDirect(eventId, participants, options) {
    // Validate participants exist
    for (var i = 0; i < participants.length; i++) {
        var pId = participants[i];
        var char = _getCharacterById(pId);
        if (!char) {
            return { success: false, error: 'Character not found: ' + pId };
        }
    }
    
    var result;
    switch (eventId) {
        case 'new_casual_romance':
            result = _executeNewCasualRomance(participants[0], participants[1], options);
            break;
        case 'new_committed':
            result = _executeNewCommittedRelationship(participants[0], participants[1], options);
            break;
        case 'marriage':
            result = _executeMarriage(participants[0], participants[1], options);
            break;
        case 'breakup':
            result = _executeBreakup(participants[0], participants[1], options);
            break;
        case 'new_friendship':
            result = _executeNewFriendship(participants[0], participants[1], options);
            break;
        case 'fight':
            result = _executeFight(participants[0], participants[1], options);
            break;
        case 'rivalry':
            result = _executeRivalry(participants[0], participants[1], options);
            break;
        case 'moving_day':
            result = _executeMovingDay(participants[0], options);
            break;
        case 'new_role':
            result = _executeNewRole(participants[0], options);
            break;
        case 'apprenticeship':
            result = _executeApprenticeship(participants[0], participants[1], options);
            break;
        default:
            return { success: false, error: 'Event execution not implemented for "' + eventId + '"' };
    }
    
    if (result.success) {
        _logEvent('social_event', eventId, result.description, 
            participants.map(function(id) { return _getCharacterById(id); }));
    }
    
    return result;
}

// =============================================================================
// 7. EVENT EXECUTORS (Delegating to canonical systems)
// =============================================================================

function _executeNewCasualRomance(charIdA, charIdB, options) {
    var charA = _getCharacterById(charIdA);
    var charB = _getCharacterById(charIdB);
    
    if (!charA || !charB) {
        return { success: false, error: 'Character not found' };
    }
    
    if (_getRelationshipBetween(charIdA, charIdB)) {
        return { success: false, error: 'Already in a relationship' };
    }
    
    var startYear = options.year || _getCurrentYear();
    
    if (typeof window.startCasualDating === 'function') {
        var result = window.startCasualDating(charIdA, charIdB, { startYear: startYear });
        if (!result) {
            return { success: false, error: 'Failed to create relationship' };
        }
    } else {
        return { success: false, error: 'Romance system not available' };
    }
    
    return {
        success: true,
        description: charA.name + ' and ' + charB.name + ' started casually dating in ' + startYear,
        participants: [charIdA, charIdB]
    };
}

function _executeNewCommittedRelationship(charIdA, charIdB, options) {
    var charA = _getCharacterById(charIdA);
    var charB = _getCharacterById(charIdB);
    
    if (!charA || !charB) {
        return { success: false, error: 'Character not found' };
    }
    
    var startYear = options.year || _getCurrentYear();
    var attributes = options.attributes || [];
    
    if (typeof window.startCommittedRelationship === 'function') {
        var result = window.startCommittedRelationship(charIdA, charIdB, { 
            startYear: startYear, 
            attributes: attributes 
        });
        if (!result) {
            return { success: false, error: 'Failed to create relationship' };
        }
    } else {
        return { success: false, error: 'Romance system not available' };
    }
    
    var attrText = attributes.length ? ' (' + attributes.join(', ') + ')' : '';
    
    return {
        success: true,
        description: charA.name + ' and ' + charB.name + ' entered a committed relationship' + attrText + ' in ' + startYear,
        participants: [charIdA, charIdB]
    };
}

function _executeMarriage(charIdA, charIdB, options) {
    var charA = _getCharacterById(charIdA);
    var charB = _getCharacterById(charIdB);
    
    if (!charA || !charB) {
        return { success: false, error: 'Character not found' };
    }
    
    var year = options.year || _getCurrentYear();
    
    if (typeof window.marryCharacters === 'function') {
        var result = window.marryCharacters(charIdA, charIdB, { marriageYear: year });
        if (!result) {
            return { success: false, error: 'Failed to marry characters' };
        }
    } else if (typeof window.addRelationshipAttribute === 'function') {
        var relationship = _getRelationshipBetween(charIdA, charIdB);
        var committed = window.RELATIONSHIP_ARCHETYPES ? window.RELATIONSHIP_ARCHETYPES.COMMITTED : 'committed';
        
        if (relationship && relationship.type === committed) {
            window.addRelationshipAttribute(charIdA, charIdB, 'married');
        } else {
            // Try to create committed relationship with married attribute
            if (typeof window.startCommittedRelationship === 'function') {
                window.startCommittedRelationship(charIdA, charIdB, { 
                    startYear: year, 
                    attributes: ['married'] 
                });
            } else {
                return { success: false, error: 'Marriage system not available' };
            }
        }
    } else {
        return { success: false, error: 'Marriage system not available' };
    }
    
    return {
        success: true,
        description: charA.name + ' and ' + charB.name + ' were married in ' + year,
        participants: [charIdA, charIdB]
    };
}

function _executeBreakup(charIdA, charIdB, options) {
    var charA = _getCharacterById(charIdA);
    var charB = _getCharacterById(charIdB);
    
    if (!charA || !charB) {
        return { success: false, error: 'Character not found' };
    }
    
    var year = options.endYear || options.year || _getCurrentYear();
    var reason = options.reason || 'Relationship ended';
    var endType = options.endType || 'breakup';
    
    // Check if they are actually in a relationship
    var relationship = _getRelationshipBetween(charIdA, charIdB);
    if (!relationship) {
        return { success: false, error: 'No relationship found to end' };
    }
    
    if (typeof window.breakup === 'function') {
        var result = window.breakup(charIdA, charIdB, { 
            endYear: year, 
            endReason: reason,
            endType: endType
        });
        if (!result || !result.success) {
            return { success: false, error: result?.reason || 'Failed to end relationship' };
        }
    } else if (typeof window.endRelationship === 'function') {
        var result = window.endRelationship(relationship.id, year, reason);
        if (!result) {
            return { success: false, error: 'Failed to end relationship' };
        }
    } else {
        return { success: false, error: 'Breakup system not available' };
    }
    
    return {
        success: true,
        description: charA.name + ' and ' + charB.name + ' ended their relationship in ' + year + ' (' + endType + '). Reason: ' + reason,
        participants: [charIdA, charIdB]
    };
}

function _executeNewFriendship(charIdA, charIdB, options) {
    var charA = _getCharacterById(charIdA);
    var charB = _getCharacterById(charIdB);
    
    if (!charA || !charB) {
        return { success: false, error: 'Character not found' };
    }
    
    var startYear = options.year || _getCurrentYear();
    
    // Check if already friends
    if (_areFriends(charIdA, charIdB)) {
        return { success: false, error: 'Already friends' };
    }
    
    if (typeof window.createFriendship === 'function') {
        var result = window.createFriendship(charIdA, charIdB, { startYear: startYear });
        if (!result) {
            return { success: false, error: 'Failed to create friendship' };
        }
    } else {
        return { success: false, error: 'Friendship system not available' };
    }
    
    return {
        success: true,
        description: charA.name + ' and ' + charB.name + ' became friends in ' + startYear,
        participants: [charIdA, charIdB]
    };
}

function _executeFight(charIdA, charIdB, options) {
    var charA = _getCharacterById(charIdA);
    var charB = _getCharacterById(charIdB);
    
    if (!charA || !charB) {
        return { success: false, error: 'Character not found' };
    }
    
    var year = options.year || _getCurrentYear();
    
    // Try to create rivalry or trigger confrontation
    if (typeof window.triggerConfrontation === 'function') {
        window.triggerConfrontation(charIdA, charIdB, { aboutId: options.aboutId });
        return {
            success: true,
            description: charA.name + ' and ' + charB.name + ' got into a fight in ' + year,
            participants: [charIdA, charIdB]
        };
    } else if (typeof window.createRivalry === 'function') {
        window.createRivalry(charIdA, charIdB, 'Fight');
        return {
            success: true,
            description: charA.name + ' and ' + charB.name + ' fought and became rivals in ' + year,
            participants: [charIdA, charIdB]
        };
    }
    
    return { success: false, error: 'Conflict system not available' };
}

function _executeRivalry(charIdA, charIdB, options) {
    var charA = _getCharacterById(charIdA);
    var charB = _getCharacterById(charIdB);
    
    if (!charA || !charB) {
        return { success: false, error: 'Character not found' };
    }
    
    var year = options.year || _getCurrentYear();
    var cause = options.cause || 'Personal conflict';
    
    if (typeof window.createRivalry === 'function') {
        window.createRivalry(charIdA, charIdB, cause);
    } else {
        return { success: false, error: 'Rivalry system not available' };
    }
    
    return {
        success: true,
        description: charA.name + ' and ' + charB.name + ' became rivals in ' + year + ' over ' + cause,
        participants: [charIdA, charIdB]
    };
}

function _executeMovingDay(charId, options) {
    var character = _getCharacterById(charId);
    if (!character) {
        return { success: false, error: 'Character not found' };
    }
    
    var year = options.year || _getCurrentYear();
    var newLocationId = options.newLocationId;
    
    if (!newLocationId) {
        return { success: false, error: 'No destination specified' };
    }
    
    if (typeof window.recordMove === 'function') {
        var result = window.recordMove(charId, newLocationId, { 
            year: year, 
            note: options.reason || 'Relocated' 
        });
        if (!result) {
            return { success: false, error: 'Failed to record move' };
        }
    } else {
        return { success: false, error: 'Travel system not available' };
    }
    
    var newLocation = _getPlaceById(newLocationId);
    var locationName = newLocation ? newLocation.displayName : 'a new location';
    
    return {
        success: true,
        description: character.name + ' moved to ' + locationName + ' in ' + year,
        participants: [charId]
    };
}

function _executeNewRole(charId, options) {
    var character = _getCharacterById(charId);
    if (!character) {
        return { success: false, error: 'Character not found' };
    }
    
    var roleId = options.roleId;
    if (!roleId) {
        return { success: false, error: 'No role specified' };
    }
    
    var role = typeof window.getRoleById === 'function' ? window.getRoleById(roleId) : null;
    if (!role) {
        return { success: false, error: 'Role not found' };
    }
    
    if (typeof window.addProfession === 'function') {
        var result = window.addProfession(charId, roleId, {
            primary: !character.professions || character.professions.length === 0,
            notes: 'Gained in ' + (options.year || _getCurrentYear())
        });
        if (!result || !result.success) {
            return { success: false, error: result?.reason || 'Failed to add role' };
        }
    } else {
        return { success: false, error: 'Character system not available' };
    }
    
    return {
        success: true,
        description: character.name + ' gained the role of ' + role.name,
        participants: [charId]
    };
}

function _executeApprenticeship(masterId, apprenticeId, options) {
    var master = _getCharacterById(masterId);
    var apprentice = _getCharacterById(apprenticeId);
    
    if (!master || !apprentice) {
        return { success: false, error: 'Character not found' };
    }
    
    var startYear = options.year || _getCurrentYear();
    
    if (typeof window.createApprenticeship === 'function') {
        var result = window.createApprenticeship(masterId, apprenticeId, {
            startYear: startYear,
            notes: options.notes
        });
        if (!result) {
            return { success: false, error: 'Failed to create apprenticeship' };
        }
    } else {
        return { success: false, error: 'Apprenticeship system not available' };
    }
    
    return {
        success: true,
        description: apprentice.name + ' became an apprentice to ' + master.name + ' in ' + startYear,
        participants: [masterId, apprenticeId]
    };
}

// =============================================================================
// 8. RANDOM EVENT SELECTION
// =============================================================================

function selectRandomSocialEvent(availableCharacters) {
    var allEvents = [];
    for (var i = 0; i < SOCIAL_EVENT_CATEGORIES.length; i++) {
        var category = SOCIAL_EVENT_CATEGORIES[i];
        for (var j = 0; j < category.events.length; j++) {
            allEvents.push(category.events[j]);
        }
    }
    
    var possibleEvents = [];
    for (var k = 0; k < allEvents.length; k++) {
        var event = allEvents[k];
        if (event.requiresTwo && availableCharacters.length < 2) continue;
        if (event.requiresOne && availableCharacters.length < 1) continue;
        possibleEvents.push(event);
    }
    
    if (possibleEvents.length === 0) return null;
    
    var selectedEvent = _pickRandom(possibleEvents);
    
    var participants = [];
    if (selectedEvent.requiresTwo) {
        var eligible = _getRandomEligibleCharacters(2, { minAge: selectedEvent.minAge || 0 });
        participants = eligible.map(function(c) { return c.id; });
    } else if (selectedEvent.requiresOne) {
        var eligible = _getRandomEligibleCharacters(1, { minAge: selectedEvent.minAge || 0 });
        participants = eligible.map(function(c) { return c.id; });
    }
    
    if (participants.length === 0) return null;
    
    return {
        event: selectedEvent,
        participants: participants
    };
}

function simulateRandomSocialEvent(year, baseChance) {
    baseChance = baseChance || 0.1;
    
    var shouldOccur = _chance(baseChance);
    if (!shouldOccur) return null;
    
    var livingCharacters = _getCharacters()
        .filter(function(c) { return !c.isDeceased; })
        .map(function(c) { return c.id; });
    
    if (livingCharacters.length === 0) return null;
    
    var selection = selectRandomSocialEvent(livingCharacters);
    if (!selection) return null;
    
    return triggerSocialEventWithConfirm(selection.event.id, selection.participants, { year: year });
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.SOCIAL_EVENT_CATEGORIES = SOCIAL_EVENT_CATEGORIES;
window.getSocialEventCategories = getSocialEventCategories;
window.getEventsByCategory = getEventsByCategory;
window.triggerSocialEvent = triggerSocialEvent;
window.triggerSocialEventWithConfirm = triggerSocialEventWithConfirm;
window.selectRandomSocialEvent = selectRandomSocialEvent;
window.simulateRandomSocialEvent = simulateRandomSocialEvent;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SOCIAL_EVENT_CATEGORIES: SOCIAL_EVENT_CATEGORIES,
        getSocialEventCategories: getSocialEventCategories,
        getEventsByCategory: getEventsByCategory,
        triggerSocialEvent: triggerSocialEvent,
        triggerSocialEventWithConfirm: triggerSocialEventWithConfirm,
        selectRandomSocialEvent: selectRandomSocialEvent,
        simulateRandomSocialEvent: simulateRandomSocialEvent
    };
}