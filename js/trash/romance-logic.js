/**
 * =============================================================================
 * STILL WATERS - ROMANCE LOGIC
 * =============================================================================
 * 
 * Romance-specific business logic built on top of the relationship registry.
 * 
 * KEY PRINCIPLES:
 * - Relationships are: one_night_stand, casual_dating, or committed
 * - Everything else is an ATTRIBUTE on committed relationships
 * - No special "marriage" type - it's just MARRIED attribute
 * - One night stands start and end in the same year automatically
 * - Breakup ends any relationship (same for committed and casual)
 * - Widowed status for death of partner
 * - Smart creation with auto-affair detection
 * - Validation with conflict detection
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js
 *   - relationship-types.js
 *   - accessors.js (getCharacterById, getCharacters)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEPENDENCY WRAPPERS
// =============================================================================

function _getRelationshipBetween(idA, idB) {
    if (typeof window.getRelationshipBetween === 'function') {
        return window.getRelationshipBetween(idA, idB);
    }
    return null;
}

function _getRelationshipsForCharacter(id, options) {
    if (typeof window.getRelationshipsForCharacter === 'function') {
        return window.getRelationshipsForCharacter(id, options);
    }
    return [];
}

function _createRelationship(idA, idB, options) {
    if (typeof window.createRelationship === 'function') {
        return window.createRelationship(idA, idB, options);
    }
    return null;
}

function _updateRelationship(relId, updates) {
    if (typeof window.updateRelationship === 'function') {
        return window.updateRelationship(relId, updates);
    }
    return null;
}

function _endRelationship(relId, endYear, endReason) {
    if (typeof window.endRelationship === 'function') {
        return window.endRelationship(relId, endYear, endReason);
    }
    return false;
}

function _setRelationshipWidowed(relId, endYear) {
    if (typeof window.setRelationshipWidowed === 'function') {
        return window.setRelationshipWidowed(relId, endYear);
    }
    return false;
}

function _addRelationshipAttribute(rel, attribute) {
    var currentAttrs = rel.metadata?.attributes || [];
    if (currentAttrs.indexOf(attribute) !== -1) return false;
    
    var result = _updateRelationship(rel.id, {
        metadata: {
            ...rel.metadata,
            attributes: [...currentAttrs, attribute]
        }
    });
    return result !== null;
}

function _removeRelationshipAttribute(rel, attribute) {
    var currentAttrs = rel.metadata?.attributes || [];
    if (currentAttrs.indexOf(attribute) === -1) return false;
    
    var newAttrs = currentAttrs.filter(function(a) { return a !== attribute; });
    var result = _updateRelationship(rel.id, {
        metadata: {
            ...rel.metadata,
            attributes: newAttrs
        }
    });
    return result !== null;
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

function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
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

function _logEvent(category, type, message, subjects) {
    if (typeof window.logEvent === 'function') {
        window.logEvent(category, type, message, subjects);
    } else {
        console.log('[' + category + '] ' + type + ': ' + message);
    }
}

function _getRankById(id) {
    if (typeof window.getRankById === 'function') {
        return window.getRankById(id);
    }
    return null;
}

// =============================================================================
// 2. CONSTANTS
// =============================================================================

function _getArchetypes() {
    return window.RELATIONSHIP_ARCHETYPES || {
        CASUAL_DATING: 'casual_dating',
        ONE_NIGHT_STAND: 'one_night_stand',
        COMMITTED: 'committed'
    };
}

function _getAttributes() {
    return window.RELATIONSHIP_ATTRIBUTES || {
        MARRIED: 'married',
        ENGAGED: 'engaged',
        COHABITING: 'cohabiting',
        CIVIL_UNION: 'civil_union',
        HANDFASTED: 'handfasted',
        POLYAMOROUS: 'polyamorous',
        MONOGAMOUS: 'monogamous',
        ARRANGED: 'arranged',
        LOVE_MATCH: 'love_match',
        DUTY_MATCH: 'duty_match',
        SECRET: 'secret',
        PUBLIC: 'public',
        SCANDALOUS: 'scandalous',
        MORGANATIC: 'morganatic',
        LEVITIC: 'levitic',
        POSTHUMOUS: 'posthumous'
    };
}

function _getStatus() {
    return window.RELATIONSHIP_STATUS || {
        ONGOING: 'ongoing',
        ENDED: 'ended',
        WIDOWED: 'widowed'
    };
}

// =============================================================================
// 3. RELATIONSHIP CREATION
// =============================================================================

function startCasualDating(characterAId, characterBId, options) {
    options = options || {};
    var ARCHETYPES = _getArchetypes();
    var STATUS = _getStatus();
    
    return _createRelationship(characterAId, characterBId, {
        type: ARCHETYPES.CASUAL_DATING,
        status: STATUS.ONGOING,
        startYear: options.startYear || _getCurrentYear(),
        metadata: {
            notes: options.notes || ''
        }
    });
}

function startOneNightStand(characterAId, characterBId, options) {
    options = options || {};
    var ARCHETYPES = _getArchetypes();
    var STATUS = _getStatus();
    var currentYear = _getCurrentYear();
    
    var relationship = _createRelationship(characterAId, characterBId, {
        type: ARCHETYPES.ONE_NIGHT_STAND,
        status: STATUS.ONGOING,
        startYear: options.startYear || currentYear,
        metadata: {
            isEphemeral: true,
            notes: options.notes || ''
        }
    });
    
    // One night stands end automatically in the same year
    if (relationship) {
        _endRelationship(relationship.id, relationship.startYear || currentYear, 'One night stand');
        
        var charA = _getCharacterById(characterAId);
        var charB = _getCharacterById(characterBId);
        _logEvent('romance', 'One Night Stand',
            charA?.name + ' and ' + charB?.name + ' had a one night stand in ' + (relationship.startYear || currentYear),
            [charA, charB]);
    }
    
    return relationship;
}

function startCommittedRelationship(characterAId, characterBId, options) {
    options = options || {};
    var ARCHETYPES = _getArchetypes();
    var STATUS = _getStatus();
    var attributes = options.attributes || [];
    
    return _createRelationship(characterAId, characterBId, {
        type: ARCHETYPES.COMMITTED,
        status: STATUS.ONGOING,
        startYear: options.startYear || _getCurrentYear(),
        metadata: {
            attributes: attributes,
            notes: options.notes || ''
        }
    });
}

// =============================================================================
// 4. ADD/REMOVE ATTRIBUTES
// =============================================================================

function addRelationshipAttribute(characterAId, characterBId, attribute) {
    var relationship = _getRelationshipBetween(characterAId, characterBId);
    if (!relationship || relationship.type !== 'committed') return false;
    return _addRelationshipAttribute(relationship, attribute);
}

function removeRelationshipAttribute(characterAId, characterBId, attribute) {
    var relationship = _getRelationshipBetween(characterAId, characterBId);
    if (!relationship || relationship.type !== 'committed') return false;
    return _removeRelationshipAttribute(relationship, attribute);
}

// =============================================================================
// 5. VALIDATION & CONFLICT DETECTION
// =============================================================================

function canHaveMultiplePartners(characterId) {
    var character = _getCharacterById(characterId);
    if (!character) return false;
    
    // Check rank-based polygamy
    if (character.activeRankId) {
        var rank = _getRankById(character.activeRankId);
        if (rank && rank.allowsMultipleSpouses) {
            return true;
        }
    }
    
    // Check trait
    if (character.traits && character.traits.indexOf('polygamous') !== -1) {
        return true;
    }
    
    // Check if character is already in a polyamorous relationship
    var relationships = getActiveRomanticRelationships(characterId);
    for (var i = 0; i < relationships.length; i++) {
        var attrs = relationships[i].metadata?.attributes || [];
        if (attrs.indexOf('polyamorous') !== -1) {
            return true;
        }
    }
    
    return false;
}

function getRelationshipConflicts(characterAId, characterBId) {
    var charA = _getCharacterById(characterAId);
    var charB = _getCharacterById(characterBId);
    var conflicts = [];
    var ARCHETYPES = _getArchetypes();
    var STATUS = _getStatus();
    
    if (!charA || !charB) {
        conflicts.push({ type: 'missing_character', message: 'Character not found' });
        return conflicts;
    }
    
    // Check if already in a relationship with each other
    var existing = _getRelationshipBetween(characterAId, characterBId);
    if (existing && existing.status === STATUS.ONGOING) {
        conflicts.push({
            type: 'already_together',
            message: charA.name + ' and ' + charB.name + ' are already in a relationship'
        });
    }
    
    // Check existing relationships for both parties
    var existingA = getActiveRomanticRelationships(characterAId);
    var existingB = getActiveRomanticRelationships(characterBId);
    
    if (existingA.length > 0 && !canHaveMultiplePartners(characterAId)) {
        conflicts.push({
            type: 'existing_relationship_a',
            message: charA.name + ' is already in ' + existingA.length + ' relationship(s) and cannot have multiple partners (would need to be an affair)'
        });
    }
    
    if (existingB.length > 0 && !canHaveMultiplePartners(characterBId)) {
        conflicts.push({
            type: 'existing_relationship_b',
            message: charB.name + ' is already in ' + existingB.length + ' relationship(s) and cannot have multiple partners (would need to be an affair)'
        });
    }
    
    // Age checks
    var currentYear = _getCurrentYear();
    var ageA = _calculateAge(charA.birthYear, charA.isDeceased, charA.deathYear);
    var ageB = _calculateAge(charB.birthYear, charB.isDeceased, charB.deathYear);
    var minAge = 12;
    
    if (ageA < minAge) {
        conflicts.push({
            type: 'underage_a',
            message: charA.name + ' is only ' + ageA + ' years old (minimum ' + minAge + ')'
        });
    }
    if (ageB < minAge) {
        conflicts.push({
            type: 'underage_b',
            message: charB.name + ' is only ' + ageB + ' years old (minimum ' + minAge + ')'
        });
    }
    
    return conflicts;
}

function canStartRelationship(characterAId, characterBId, options) {
    options = options || {};
    var conflicts = getRelationshipConflicts(characterAId, characterBId);
    var archetype = options.archetype || 'casual_dating';
    
    // For one night stands, existing relationships are not a conflict
    var ARCHETYPES = _getArchetypes();
    if (archetype === ARCHETYPES.ONE_NIGHT_STAND) {
        var filteredConflicts = conflicts.filter(function(c) {
            return c.type !== 'existing_relationship_a' &&
                   c.type !== 'existing_relationship_b';
        });
        return {
            canStart: filteredConflicts.length === 0,
            conflicts: filteredConflicts,
            advice: filteredConflicts.length > 0 ? filteredConflicts[0].message : null
        };
    }
    
    return {
        canStart: conflicts.length === 0,
        conflicts: conflicts,
        advice: conflicts.length > 0 ? conflicts[0].message : null
    };
}

function getRelationshipAdviceString(characterAId, characterBId) {
    var conflicts = getRelationshipConflicts(characterAId, characterBId);
    
    if (conflicts.length === 0) {
        return "No conflicts detected. This relationship can proceed normally.";
    }
    
    var charA = _getCharacterById(characterAId);
    var charB = _getCharacterById(characterBId);
    var hasExistingA = false;
    var hasExistingB = false;
    
    for (var i = 0; i < conflicts.length; i++) {
        if (conflicts[i].type === 'existing_relationship_a') hasExistingA = true;
        if (conflicts[i].type === 'existing_relationship_b') hasExistingB = true;
    }
    
    if (hasExistingA || hasExistingB) {
        var aHasExisting = hasExistingA && !canHaveMultiplePartners(characterAId);
        var bHasExisting = hasExistingB && !canHaveMultiplePartners(characterBId);
        
        if (aHasExisting && bHasExisting) {
            return 'Both ' + (charA?.name || 'Character A') + ' and ' + (charB?.name || 'Character B') + ' are already in relationships and neither can have multiple partners. This would need to be a SECRET affair.';
        } else if (aHasExisting) {
            return (charA?.name || 'Character A') + ' is already in a relationship and cannot have multiple partners. This would need to be a SECRET affair.';
        } else if (bHasExisting) {
            return (charB?.name || 'Character B') + ' is already in a relationship and cannot have multiple partners. This would need to be a SECRET affair.';
        } else {
            return 'One or both characters are already in relationships, but they may be able to have multiple partners (polyamorous).';
        }
    }
    
    return conflicts[0]?.message || 'Unknown conflict';
}

// =============================================================================
// 6. RELATIONSHIP QUERIES
// =============================================================================

function getActiveRomanticRelationships(characterId) {
    var ARCHETYPES = _getArchetypes();
    var relationships = _getRelationshipsForCharacter(characterId, { activeOnly: true });
    
    return relationships.filter(function(r) {
        return r.type === ARCHETYPES.CASUAL_DATING ||
               r.type === ARCHETYPES.ONE_NIGHT_STAND ||
               r.type === ARCHETYPES.COMMITTED;
    });
}

function hasActiveRomanticRelationship(characterId) {
    return getActiveRomanticRelationships(characterId).length > 0;
}

function getPrimaryPartner(characterId) {
    var ARCHETYPES = _getArchetypes();
    var relationships = getActiveRomanticRelationships(characterId);
    var committed = null;
    
    for (var i = 0; i < relationships.length; i++) {
        if (relationships[i].type === ARCHETYPES.COMMITTED) {
            committed = relationships[i];
            break;
        }
    }
    
    if (committed) {
        var partnerId = committed.participantA === characterId ?
            committed.participantB : committed.participantA;
        return _getCharacterById(partnerId);
    }
    return null;
}

function getAffairs(characterId) {
    var ARCHETYPES = _getArchetypes();
    var ATTRIBUTES = _getAttributes();
    var relationships = getActiveRomanticRelationships(characterId);
    
    return relationships.filter(function(r) {
        return r.type === ARCHETYPES.COMMITTED &&
               r.metadata?.attributes &&
               r.metadata.attributes.indexOf(ATTRIBUTES.SECRET) !== -1;
    });
}

function hasRelationshipAttribute(characterAId, characterBId, attribute) {
    var relationship = _getRelationshipBetween(characterAId, characterBId);
    if (!relationship) return false;
    return relationship.metadata?.attributes &&
           relationship.metadata.attributes.indexOf(attribute) !== -1;
}

function isAffair(characterAId, characterBId) {
    var ATTRIBUTES = _getAttributes();
    return hasRelationshipAttribute(characterAId, characterBId, ATTRIBUTES.SECRET);
}

function isSecretRelationship(characterAId, characterBId) {
    return isAffair(characterAId, characterBId);
}

// =============================================================================
// 7. BREAKUP (Ends any relationship)
// =============================================================================

function breakUp(characterAId, characterBId, options) {
    options = options || {};
    var relationship = _getRelationshipBetween(characterAId, characterBId);
    var ARCHETYPES = _getArchetypes();
    
    if (!relationship) {
        return { success: false, reason: 'No relationship found' };
    }
    
    var STATUS = _getStatus();
    if (relationship.status !== STATUS.ONGOING) {
        return { success: false, reason: 'Relationship is not active' };
    }
    
    var endYear = options.endYear || _getCurrentYear();
    var reason = options.reason || 'Breakup';
    
    var success = _endRelationship(relationship.id, endYear, reason);
    
    if (success) {
        var charA = _getCharacterById(characterAId);
        var charB = _getCharacterById(characterBId);
        _logEvent('romance', 'Breakup',
            charA?.name + ' and ' + charB?.name + ' broke up in ' + endYear + '. Reason: ' + reason,
            [charA, charB]);
        
        return {
            success: true,
            relationshipId: relationship.id,
            endType: 'breakup'
        };
    }
    
    return { success: false, reason: 'Failed to end relationship' };
}

// =============================================================================
// 8. DEATH ENDS RELATIONSHIP
// =============================================================================

function deathEndsRelationship(survivingId, deceasedId, options) {
    options = options || {};
    var relationship = _getRelationshipBetween(survivingId, deceasedId);
    
    if (!relationship) {
        return { success: false, reason: 'No relationship found' };
    }
    
    var STATUS = _getStatus();
    if (relationship.status !== STATUS.ONGOING) {
        return { success: false, reason: 'Relationship is not active' };
    }
    
    var deathYear = options.deathYear || _getCurrentYear();
    var success = _setRelationshipWidowed(relationship.id, deathYear);
    
    if (success) {
        var survivor = _getCharacterById(survivingId);
        var deceased = _getCharacterById(deceasedId);
        _logEvent('romance', 'Death of Partner',
            survivor?.name + ' was widowed when ' + deceased?.name + ' died in ' + deathYear,
            [survivor, deceased]);
        
        return {
            success: true,
            relationshipId: relationship.id,
            endType: 'death'
        };
    }
    
    return { success: false, reason: 'Failed to end relationship' };
}

// =============================================================================
// 9. SMART RELATIONSHIP CREATION WITH AUTO-AFFAIR DETECTION
// =============================================================================

function createRomanticRelationship(characterAId, characterBId, options) {
    options = options || {};
    var charA = _getCharacterById(characterAId);
    var charB = _getCharacterById(characterBId);
    var ATTRIBUTES = _getAttributes();
    var ARCHETYPES = _getArchetypes();
    var STATUS = _getStatus();
    
    if (!charA || !charB) {
        return { success: false, relationship: null, affairCreated: false, advice: 'Character not found' };
    }
    
    var existing = _getRelationshipBetween(characterAId, characterBId);
    if (existing && existing.status === STATUS.ONGOING) {
        return { success: false, relationship: null, affairCreated: false, advice: 'Already in a relationship' };
    }
    
    var startYear = options.startYear || _getCurrentYear();
    var archetype = options.archetype || ARCHETYPES.CASUAL_DATING;
    
    // Check existing relationships
    var existingA = getActiveRomanticRelationships(characterAId);
    var existingB = getActiveRomanticRelationships(characterBId);
    
    var canHaveMultipleA = canHaveMultiplePartners(characterAId);
    var canHaveMultipleB = canHaveMultiplePartners(characterBId);
    
    var hasExistingA = existingA.length > 0;
    var hasExistingB = existingB.length > 0;
    
    // Determine if this should be an affair (SECRET relationship)
    var shouldBeAffair = false;
    var affairReason = null;
    
    if (options.forceAffair) {
        shouldBeAffair = true;
        affairReason = 'Forced by user';
    } else if (archetype === ARCHETYPES.COMMITTED && (hasExistingA || hasExistingB)) {
        if (hasExistingA && !canHaveMultipleA) {
            shouldBeAffair = true;
            affairReason = charA.name + ' is already in a relationship and cannot have multiple partners';
        } else if (hasExistingB && !canHaveMultipleB) {
            shouldBeAffair = true;
            affairReason = charB.name + ' is already in a relationship and cannot have multiple partners';
        }
    }
    
    var relationship = null;
    var affairCreated = false;
    
    if (shouldBeAffair && archetype === ARCHETYPES.COMMITTED) {
        // Create as affair (committed + SECRET attribute)
        var attributes = [ATTRIBUTES.SECRET];
        
        // Add SCANDALOUS if specified
        if (options.isScandalous) {
            attributes.push(ATTRIBUTES.SCANDALOUS);
        }
        
        // Add any additional attributes
        if (options.attributes) {
            for (var i = 0; i < options.attributes.length; i++) {
                if (attributes.indexOf(options.attributes[i]) === -1) {
                    attributes.push(options.attributes[i]);
                }
            }
        }
        
        relationship = _createRelationship(characterAId, characterBId, {
            type: ARCHETYPES.COMMITTED,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                attributes: attributes,
                isAffair: true,
                affairType: options.affairType || 'secret',
                notes: options.notes || ''
            }
        });
        affairCreated = relationship !== null;
        
        if (relationship) {
            _logEvent('romance', 'Affair',
                charA.name + ' and ' + charB.name + ' began a ' + (options.isScandalous ? 'scandalous affair' : 'secret affair') + ' in ' + startYear,
                [charA, charB]);
        }
    } else if (archetype === ARCHETYPES.CASUAL_DATING) {
        relationship = startCasualDating(characterAId, characterBId, {
            startYear: startYear,
            notes: options.notes
        });
    } else if (archetype === ARCHETYPES.ONE_NIGHT_STAND) {
        relationship = startOneNightStand(characterAId, characterBId, {
            startYear: startYear,
            notes: options.notes
        });
    } else if (archetype === ARCHETYPES.COMMITTED) {
        var attrs = options.attributes || [];
        
        // If both have existing relationships but can have multiple, suggest polyamorous
        if ((hasExistingA || hasExistingB) && canHaveMultipleA && canHaveMultipleB) {
            if (attrs.indexOf(ATTRIBUTES.POLYAMOROUS) === -1) {
                attrs.push(ATTRIBUTES.POLYAMOROUS);
            }
        }
        
        relationship = startCommittedRelationship(characterAId, characterBId, {
            startYear: startYear,
            attributes: attrs,
            notes: options.notes
        });
    }
    
    var advice = '';
    if (affairCreated) {
        advice = 'This relationship has been created as a SECRET AFFAIR because: ' + affairReason;
    } else if (shouldBeAffair && archetype !== ARCHETYPES.COMMITTED) {
        advice = 'Note: ' + charA.name + ' or ' + charB.name + ' has existing relationships, but ' + archetype + ' doesn\'t require commitment.';
    } else if ((hasExistingA || hasExistingB) && archetype === ARCHETYPES.COMMITTED) {
        advice = charA.name + ' and ' + charB.name + ' are now in a committed relationship. One or both had existing relationships but can have multiple partners (polyamorous).';
    } else {
        advice = charA.name + ' and ' + charB.name + ' are now together.';
    }
    
    if (relationship) {
        _saveMasterData();
    }
    
    return {
        success: relationship !== null,
        relationship: relationship,
        affairCreated: affairCreated,
        affairReason: affairReason,
        advice: advice
    };
}

// =============================================================================
// 10. EXPORTS
// =============================================================================

// Relationship creation
window.startCasualDating = startCasualDating;
window.startOneNightStand = startOneNightStand;
window.startCommittedRelationship = startCommittedRelationship;

// Attribute management
window.addRelationshipAttribute = addRelationshipAttribute;
window.removeRelationshipAttribute = removeRelationshipAttribute;

// Validation
window.canStartRelationship = canStartRelationship;
window.getRelationshipConflicts = getRelationshipConflicts;
window.getRelationshipAdviceString = getRelationshipAdviceString;

// Relationship ending
window.breakUp = breakUp;
window.deathEndsRelationship = deathEndsRelationship;

// Queries
window.getActiveRomanticRelationships = getActiveRomanticRelationships;
window.hasActiveRomanticRelationship = hasActiveRomanticRelationship;
window.getPrimaryPartner = getPrimaryPartner;
window.getAffairs = getAffairs;
window.hasRelationshipAttribute = hasRelationshipAttribute;
window.isAffair = isAffair;
window.isSecretRelationship = isSecretRelationship;
window.canHaveMultiplePartners = canHaveMultiplePartners;

// Smart creation
window.createRomanticRelationship = createRomanticRelationship;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        startCasualDating: startCasualDating,
        startOneNightStand: startOneNightStand,
        startCommittedRelationship: startCommittedRelationship,
        addRelationshipAttribute: addRelationshipAttribute,
        removeRelationshipAttribute: removeRelationshipAttribute,
        canStartRelationship: canStartRelationship,
        getRelationshipConflicts: getRelationshipConflicts,
        getRelationshipAdviceString: getRelationshipAdviceString,
        breakUp: breakUp,
        deathEndsRelationship: deathEndsRelationship,
        getActiveRomanticRelationships: getActiveRomanticRelationships,
        hasActiveRomanticRelationship: hasActiveRomanticRelationship,
        getPrimaryPartner: getPrimaryPartner,
        getAffairs: getAffairs,
        hasRelationshipAttribute: hasRelationshipAttribute,
        isAffair: isAffair,
        isSecretRelationship: isSecretRelationship,
        canHaveMultiplePartners: canHaveMultiplePartners,
        createRomanticRelationship: createRomanticRelationship
    };
}
