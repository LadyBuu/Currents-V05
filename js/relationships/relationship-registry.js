/**
 * =============================================================================
 * STILL WATERS - RELATIONSHIP REGISTRY
 * =============================================================================
 * 
 * This file contains PURE relationship entity management including:
 * - Creating relationships
 * - Deleting relationships
 * - Querying relationships by participant
 * - Querying relationships by type
 * - Relationship indexing for fast lookups
 * - Bidirectional consistency enforcement
 * 
 * This is a DATABASE LAYER.
 * Knows NOTHING about romance, friendship, marriage, or business logic.
 * Only manages relationship entities and their persistence.
 * 
 * DEPENDENCIES: 
 *   - accessors.js (getCharacters, getCharacterById)
 *   - relationshipTypes.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS, RELATIONSHIP_ATTRIBUTES)
 *   - ids.js (generateId)
 *   - time.js (getCurrentYearSafe)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEPENDENCY WRAPPERS
// =============================================================================

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') {
        return window.getCurrentYearSafe();
    }
    if (typeof window.getCurrentYear === 'function') {
        return window.getCurrentYear();
    }
    console.warn('getCurrentYear not available, using fallback 1250');
    return 1250;
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

function _generateId(prefix) {
    if (typeof window.generateId === 'function') {
        return window.generateId(prefix);
    }
    return (prefix || 'rel') + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
}

function _getCharacters() {
    if (typeof window.getCharacters === 'function') {
        return window.getCharacters();
    }
    return [];
}

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') {
        return window.getCharacterById(id);
    }
    return null;
}

function _getRelationshipArchetypes() {
    return window.RELATIONSHIP_ARCHETYPES || {
        CASUAL_DATING: 'casual_dating',
        ONE_NIGHT_STAND: 'one_night_stand',
        COMMITTED: 'committed',
        FRIENDSHIP: 'friendship',
        RIVALRY: 'rivalry',
        ENMITY: 'enmity',
        PARENT_CHILD: 'parent_child',
        SIBLING: 'sibling',
        GRANDPARENT: 'grandparent',
        AUNT_UNCLE: 'aunt_uncle',
        COUSIN: 'cousin',
        APPRENTICESHIP: 'apprenticeship',
        MASTERSHIP: 'mastership',
        EMPLOYMENT: 'employment',
        GUILD_MEMBERSHIP: 'guild_membership'
    };
}

function _getRelationshipStatus() {
    return window.RELATIONSHIP_STATUS || {
        ONGOING: 'ongoing',
        ENDED: 'ended',
        WIDOWED: 'widowed',
        PENDING: 'pending',
        PROPOSED: 'proposed',
        DECLINED: 'declined'
    };
}

function _getRelationshipAttributes() {
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

function _isValidRelationshipType(type) {
    var ARCHETYPES = _getRelationshipArchetypes();
    for (var key in ARCHETYPES) {
        if (ARCHETYPES[key] === type) return true;
    }
    return false;
}

// =============================================================================
// 2. RELATIONSHIP INDEX (In-memory cache for performance)
// =============================================================================

var _relationshipIndex = {
    byId: new Map(),
    byCharacter: new Map(),
    byType: new Map(),
    byParticipantPair: new Map()
};

var _indexNeedsRebuild = true;

function rebuildRelationshipIndex() {
    _relationshipIndex.byId.clear();
    _relationshipIndex.byCharacter.clear();
    _relationshipIndex.byType.clear();
    _relationshipIndex.byParticipantPair.clear();
    
    var characters = _getCharacters();
    var STATUS = _getRelationshipStatus();
    var ARCHETYPES = _getRelationshipArchetypes();
    
    for (var c = 0; c < characters.length; c++) {
        var character = characters[c];
        if (!character.relationships) continue;
        
        for (var r = 0; r < character.relationships.length; r++) {
            var rel = character.relationships[r];
            var pairKey = getCanonicalPairKey(rel.partnerId, character.id);
            if (_relationshipIndex.byParticipantPair.has(pairKey)) continue;
            
            var relId = rel.id || _generateId('rel');
            if (!rel.id) rel.id = relId;
            
            var relType = rel.details?.type || rel.type || ARCHETYPES.COMMITTED;
            
            var relationship = {
                id: relId,
                type: relType,
                participantA: character.id,
                participantB: rel.partnerId,
                status: rel.status || STATUS.ONGOING,
                startYear: rel.details?.startYear || rel.startYear || null,
                endYear: rel.details?.endYear || rel.endYear || null,
                metadata: { ...(rel.details || rel.metadata || {}) }
            };
            
            _relationshipIndex.byId.set(relId, relationship);
            
            if (!_relationshipIndex.byCharacter.has(character.id)) {
                _relationshipIndex.byCharacter.set(character.id, new Set());
            }
            _relationshipIndex.byCharacter.get(character.id).add(relId);
            
            if (!_relationshipIndex.byCharacter.has(rel.partnerId)) {
                _relationshipIndex.byCharacter.set(rel.partnerId, new Set());
            }
            _relationshipIndex.byCharacter.get(rel.partnerId).add(relId);
            
            if (!_relationshipIndex.byType.has(relationship.type)) {
                _relationshipIndex.byType.set(relationship.type, new Set());
            }
            _relationshipIndex.byType.get(relationship.type).add(relId);
            
            _relationshipIndex.byParticipantPair.set(pairKey, relId);
        }
    }
    
    _indexNeedsRebuild = false;
}

function markIndexDirty() {
    _indexNeedsRebuild = true;
}

function ensureIndex() {
    if (_indexNeedsRebuild) {
        rebuildRelationshipIndex();
    }
}

function getCanonicalPairKey(idA, idB) {
    return idA < idB ? idA + '|' + idB : idB + '|' + idA;
}

// =============================================================================
// 3. RELATIONSHIP CREATION
// =============================================================================

function createRelationship(characterAId, characterBId, options) {
    var charA = _getCharacterById(characterAId);
    var charB = _getCharacterById(characterBId);
    var STATUS = _getRelationshipStatus();
    var ARCHETYPES = _getRelationshipArchetypes();
    
    if (!charA || !charB) return null;
    if (characterAId === characterBId) return null;
    
    if (!options.allowMultiple) {
        var existing = getRelationshipBetween(characterAId, characterBId);
        if (existing && existing.status === STATUS.ONGOING) return null;
    }
    
    var type = options.type || ARCHETYPES.COMMITTED;
    if (!_isValidRelationshipType(type)) {
        console.warn('Invalid relationship type: ' + type);
        return null;
    }
    
    var relationshipId = _generateId('rel');
    var startYear = options.startYear || _getCurrentYear();
    var status = options.status || STATUS.ONGOING;
    var attributes = options.attributes || [];
    var notes = options.metadata?.notes || '';
    
    var metadata = {
        type: type,
        startYear: startYear,
        attributes: attributes,
        notes: notes,
        ...options.metadata
    };
    
    if (!charA.relationships) charA.relationships = [];
    charA.relationships.push({
        id: relationshipId,
        partnerId: characterBId,
        status: status,
        details: metadata
    });
    
    if (!charB.relationships) charB.relationships = [];
    charB.relationships.push({
        id: relationshipId,
        partnerId: characterAId,
        status: status,
        details: metadata
    });
    
    _saveMasterData();
    markIndexDirty();
    
    return {
        id: relationshipId,
        participantA: characterAId,
        participantB: characterBId,
        type: type,
        status: status,
        startYear: startYear,
        endYear: null,
        metadata: metadata
    };
}

// =============================================================================
// 4. RELATIONSHIP DELETION
// =============================================================================

function deleteRelationship(relationshipId) {
    ensureIndex();
    
    var relationship = _relationshipIndex.byId.get(relationshipId);
    if (!relationship) return false;
    
    var charA = _getCharacterById(relationship.participantA);
    var charB = _getCharacterById(relationship.participantB);
    
    if (charA && charA.relationships) {
        charA.relationships = charA.relationships.filter(function(r) { return r.id !== relationshipId; });
    }
    
    if (charB && charB.relationships) {
        charB.relationships = charB.relationships.filter(function(r) { return r.id !== relationshipId; });
    }
    
    _saveMasterData();
    markIndexDirty();
    
    return true;
}

function endRelationship(relationshipId, endYear, endReason) {
    ensureIndex();
    
    var relationship = _relationshipIndex.byId.get(relationshipId);
    if (!relationship) return false;
    
    var STATUS = _getRelationshipStatus();
    
    if (relationship.status !== STATUS.ONGOING) return false;
    
    relationship.status = STATUS.ENDED;
    relationship.endYear = endYear;
    if (!relationship.metadata) relationship.metadata = {};
    relationship.metadata.endReason = endReason;
    
    var charA = _getCharacterById(relationship.participantA);
    var charB = _getCharacterById(relationship.participantB);
    
    if (charA && charA.relationships) {
        var rel = charA.relationships.find(function(r) { return r.id === relationshipId; });
        if (rel) {
            rel.status = STATUS.ENDED;
            if (!rel.details) rel.details = {};
            rel.details.endYear = endYear;
            if (endReason) rel.details.endReason = endReason;
        }
    }
    
    if (charB && charB.relationships) {
        var rel = charB.relationships.find(function(r) { return r.id === relationshipId; });
        if (rel) {
            rel.status = STATUS.ENDED;
            if (!rel.details) rel.details = {};
            rel.details.endYear = endYear;
            if (endReason) rel.details.endReason = endReason;
        }
    }
    
    _saveMasterData();
    markIndexDirty();
    
    return true;
}

function reactivateRelationship(relationshipId) {
    ensureIndex();
    
    var relationship = _relationshipIndex.byId.get(relationshipId);
    if (!relationship) return false;
    
    var STATUS = _getRelationshipStatus();
    
    if (relationship.status !== STATUS.ENDED) return false;
    
    relationship.status = STATUS.ONGOING;
    relationship.endYear = null;
    if (relationship.metadata) {
        delete relationship.metadata.endReason;
    }
    
    var charA = _getCharacterById(relationship.participantA);
    var charB = _getCharacterById(relationship.participantB);
    
    if (charA && charA.relationships) {
        var rel = charA.relationships.find(function(r) { return r.id === relationshipId; });
        if (rel) {
            rel.status = STATUS.ONGOING;
            if (rel.details) {
                delete rel.details.endYear;
                delete rel.details.endReason;
            }
        }
    }
    
    if (charB && charB.relationships) {
        var rel = charB.relationships.find(function(r) { return r.id === relationshipId; });
        if (rel) {
            rel.status = STATUS.ONGOING;
            if (rel.details) {
                delete rel.details.endYear;
                delete rel.details.endReason;
            }
        }
    }
    
    _saveMasterData();
    markIndexDirty();
    
    return true;
}

function setRelationshipWidowed(relationshipId, endYear) {
    ensureIndex();
    
    var relationship = _relationshipIndex.byId.get(relationshipId);
    if (!relationship) return false;
    
    var STATUS = _getRelationshipStatus();
    
    if (relationship.status !== STATUS.ONGOING) return false;
    
    relationship.status = STATUS.WIDOWED;
    relationship.endYear = endYear;
    if (!relationship.metadata) relationship.metadata = {};
    relationship.metadata.endReason = 'death of partner';
    
    var charA = _getCharacterById(relationship.participantA);
    var charB = _getCharacterById(relationship.participantB);
    
    if (charA && charA.relationships) {
        var rel = charA.relationships.find(function(r) { return r.id === relationshipId; });
        if (rel) {
            rel.status = STATUS.WIDOWED;
            if (!rel.details) rel.details = {};
            rel.details.endYear = endYear;
            rel.details.endReason = 'death of partner';
        }
    }
    
    if (charB && charB.relationships) {
        var rel = charB.relationships.find(function(r) { return r.id === relationshipId; });
        if (rel) {
            rel.status = STATUS.WIDOWED;
            if (!rel.details) rel.details = {};
            rel.details.endYear = endYear;
            rel.details.endReason = 'death of partner';
        }
    }
    
    _saveMasterData();
    markIndexDirty();
    
    return true;
}

// =============================================================================
// 5. RELATIONSHIP QUERIES
// =============================================================================

function getRelationshipById(relationshipId) {
    ensureIndex();
    return _relationshipIndex.byId.get(relationshipId) || null;
}

function getRelationshipBetween(characterAId, characterBId) {
    ensureIndex();
    var pairKey = getCanonicalPairKey(characterAId, characterBId);
    var relId = _relationshipIndex.byParticipantPair.get(pairKey);
    return relId ? _relationshipIndex.byId.get(relId) || null : null;
}

function relationshipExists(characterAId, characterBId) {
    return getRelationshipBetween(characterAId, characterBId) !== null;
}

function getRelationshipTypeBetween(characterAId, characterBId) {
    var rel = getRelationshipBetween(characterAId, characterBId);
    return rel ? rel.type : null;
}

function hasActiveRelationship(characterAId, characterBId) {
    var rel = getRelationshipBetween(characterAId, characterBId);
    var STATUS = _getRelationshipStatus();
    return rel && rel.status === STATUS.ONGOING;
}

function hasRelationshipOfType(characterAId, characterBId, type) {
    var rel = getRelationshipBetween(characterAId, characterBId);
    return rel && rel.type === type;
}

function getMostRecentRelationship(characterAId, characterBId) {
    return getRelationshipBetween(characterAId, characterBId);
}

function getRelationshipsForCharacter(characterId, options) {
    ensureIndex();
    
    options = options || {};
    var STATUS = _getRelationshipStatus();
    
    var relIds = _relationshipIndex.byCharacter.get(characterId);
    if (!relIds) return [];
    
    var relationships = Array.from(relIds)
        .map(function(id) { return _relationshipIndex.byId.get(id); })
        .filter(function(r) { return r; });
    
    if (options.type) {
        relationships = relationships.filter(function(r) { return r.type === options.type; });
    }
    
    if (options.status) {
        relationships = relationships.filter(function(r) { return r.status === options.status; });
    } else if (options.activeOnly) {
        relationships = relationships.filter(function(r) { return r.status === STATUS.ONGOING; });
    }
    
    if (options.limit !== null && options.limit > 0) {
        relationships = relationships.slice(options.offset || 0, (options.offset || 0) + options.limit);
    }
    
    return relationships;
}

function getRelationshipsByType(type, options) {
    ensureIndex();
    
    options = options || {};
    var STATUS = _getRelationshipStatus();
    
    var relIds = _relationshipIndex.byType.get(type);
    if (!relIds) return [];
    
    var relationships = Array.from(relIds)
        .map(function(id) { return _relationshipIndex.byId.get(id); })
        .filter(function(r) { return r; });
    
    if (options.status) {
        relationships = relationships.filter(function(r) { return r.status === options.status; });
    } else if (options.activeOnly) {
        relationships = relationships.filter(function(r) { return r.status === STATUS.ONGOING; });
    }
    
    if (options.limit !== null && options.limit > 0) {
        relationships = relationships.slice(options.offset || 0, (options.offset || 0) + options.limit);
    }
    
    return relationships;
}

function getRelationshipsByTypeAndStatus(type, status) {
    ensureIndex();
    
    var relIds = _relationshipIndex.byType.get(type);
    if (!relIds) return [];
    
    var relationships = Array.from(relIds)
        .map(function(id) { return _relationshipIndex.byId.get(id); })
        .filter(function(r) { return r; });
    
    if (status) {
        relationships = relationships.filter(function(r) { return r.status === status; });
    }
    
    return relationships;
}

function getActiveRelationships(characterId) {
    return getRelationshipsForCharacter(characterId, { activeOnly: true });
}

function getCharacterRelationshipsByType(characterId, type) {
    return getRelationshipsForCharacter(characterId, { type: type });
}

function getAllRelationships() {
    ensureIndex();
    return Array.from(_relationshipIndex.byId.values());
}

// =============================================================================
// 6. RELATIONSHIP UPDATES
// =============================================================================

function updateRelationship(relationshipId, updates) {
    ensureIndex();
    
    var relationship = _relationshipIndex.byId.get(relationshipId);
    if (!relationship) return null;
    
    var STATUS = _getRelationshipStatus();
    var charA = _getCharacterById(relationship.participantA);
    var charB = _getCharacterById(relationship.participantB);
    
    if (updates.type && _isValidRelationshipType(updates.type)) {
        relationship.type = updates.type;
    }
    
    if (updates.status) {
        relationship.status = updates.status;
        
        if (updates.status === STATUS.ENDED && updates.endYear === undefined && relationship.endYear === null) {
            relationship.endYear = updates.endYear || _getCurrentYear();
        }
        
        if (updates.status === STATUS.ONGOING) {
            relationship.endYear = null;
            if (relationship.metadata) {
                delete relationship.metadata.endReason;
            }
        }
        
        if (charA && charA.relationships) {
            var relA = charA.relationships.find(function(r) { return r.id === relationshipId; });
            if (relA) {
                relA.status = updates.status;
                if (relationship.endYear && (!relA.details || relA.details.endYear === undefined)) {
                    if (!relA.details) relA.details = {};
                    relA.details.endYear = relationship.endYear;
                }
                if (updates.status === STATUS.ONGOING && relA.details) {
                    delete relA.details.endYear;
                    delete relA.details.endReason;
                }
            }
        }
        
        if (charB && charB.relationships) {
            var relB = charB.relationships.find(function(r) { return r.id === relationshipId; });
            if (relB) {
                relB.status = updates.status;
                if (relationship.endYear && (!relB.details || relB.details.endYear === undefined)) {
                    if (!relB.details) relB.details = {};
                    relB.details.endYear = relationship.endYear;
                }
                if (updates.status === STATUS.ONGOING && relB.details) {
                    delete relB.details.endYear;
                    delete relB.details.endReason;
                }
            }
        }
    }
    
    if (updates.endYear !== undefined) {
        relationship.endYear = updates.endYear;
        
        if (charA && charA.relationships) {
            var relA = charA.relationships.find(function(r) { return r.id === relationshipId; });
            if (relA) {
                if (!relA.details) relA.details = {};
                relA.details.endYear = updates.endYear;
            }
        }
        if (charB && charB.relationships) {
            var relB = charB.relationships.find(function(r) { return r.id === relationshipId; });
            if (relB) {
                if (!relB.details) relB.details = {};
                relB.details.endYear = updates.endYear;
            }
        }
    }
    
    if (updates.attributes !== undefined) {
        if (!relationship.metadata) relationship.metadata = {};
        relationship.metadata.attributes = updates.attributes;
        
        if (charA && charA.relationships) {
            var relA = charA.relationships.find(function(r) { return r.id === relationshipId; });
            if (relA) {
                if (!relA.details) relA.details = {};
                relA.details.attributes = updates.attributes;
            }
        }
        if (charB && charB.relationships) {
            var relB = charB.relationships.find(function(r) { return r.id === relationshipId; });
            if (relB) {
                if (!relB.details) relB.details = {};
                relB.details.attributes = updates.attributes;
            }
        }
    }
    
    if (updates.metadata) {
        relationship.metadata = { ...relationship.metadata, ...updates.metadata };
        
        if (charA && charA.relationships) {
            var relA = charA.relationships.find(function(r) { return r.id === relationshipId; });
            if (relA) {
                if (!relA.details) relA.details = {};
                relA.details = { ...relA.details, ...updates.metadata };
            }
        }
        if (charB && charB.relationships) {
            var relB = charB.relationships.find(function(r) { return r.id === relationshipId; });
            if (relB) {
                if (!relB.details) relB.details = {};
                relB.details = { ...relB.details, ...updates.metadata };
            }
        }
    }
    
    _saveMasterData();
    markIndexDirty();
    
    return { ...relationship };
}

// =============================================================================
// 7. BULK OPERATIONS
// =============================================================================

function deleteAllRelationshipsForCharacter(characterId) {
    var relationships = getRelationshipsForCharacter(characterId);
    var deleted = 0;
    
    for (var i = 0; i < relationships.length; i++) {
        if (deleteRelationship(relationships[i].id)) {
            deleted++;
        }
    }
    
    return deleted;
}

function getRelationshipCount(characterId) {
    return getRelationshipsForCharacter(characterId).length;
}

function getRelationshipCountByType(characterId, type) {
    return getCharacterRelationshipsByType(characterId, type).length;
}

// =============================================================================
// 8. VALIDATION
// =============================================================================

function validateRelationshipIntegrity() {
    ensureIndex();
    var issues = [];
    
    var entries = Array.from(_relationshipIndex.byId.entries());
    for (var e = 0; e < entries.length; e++) {
        var relId = entries[e][0];
        var relationship = entries[e][1];
        
        var charA = _getCharacterById(relationship.participantA);
        var charB = _getCharacterById(relationship.participantB);
        
        if (!charA) {
            issues.push('Relationship ' + relId + ': Participant A ' + relationship.participantA + ' not found');
        }
        
        if (!charB) {
            issues.push('Relationship ' + relId + ': Participant B ' + relationship.participantB + ' not found');
        }
        
        if (charA && charA.relationships) {
            var hasReverse = charA.relationships.some(function(r) { return r.id === relId; });
            if (!hasReverse) {
                issues.push('Relationship ' + relId + ': Missing reverse entry in ' + relationship.participantA + '\'s relationships');
            }
        }
        
        if (charB && charB.relationships) {
            var hasReverse = charB.relationships.some(function(r) { return r.id === relId; });
            if (!hasReverse) {
                issues.push('Relationship ' + relId + ': Missing reverse entry in ' + relationship.participantB + '\'s relationships');
            }
        }
    }
    
    return {
        isValid: issues.length === 0,
        issueCount: issues.length,
        issues: issues
    };
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.rebuildRelationshipIndex = rebuildRelationshipIndex;
window.ensureIndex = ensureIndex;
window.markIndexDirty = markIndexDirty;

window.createRelationship = createRelationship;

window.deleteRelationship = deleteRelationship;
window.endRelationship = endRelationship;
window.reactivateRelationship = reactivateRelationship;
window.setRelationshipWidowed = setRelationshipWidowed;

window.getRelationshipById = getRelationshipById;
window.getRelationshipBetween = getRelationshipBetween;
window.relationshipExists = relationshipExists;
window.getRelationshipTypeBetween = getRelationshipTypeBetween;
window.hasActiveRelationship = hasActiveRelationship;
window.hasRelationshipOfType = hasRelationshipOfType;
window.getMostRecentRelationship = getMostRecentRelationship;
window.getRelationshipsForCharacter = getRelationshipsForCharacter;
window.getRelationshipsByType = getRelationshipsByType;
window.getRelationshipsByTypeAndStatus = getRelationshipsByTypeAndStatus;
window.getActiveRelationships = getActiveRelationships;
window.getCharacterRelationshipsByType = getCharacterRelationshipsByType;
window.getAllRelationships = getAllRelationships;

window.updateRelationship = updateRelationship;

window.deleteAllRelationshipsForCharacter = deleteAllRelationshipsForCharacter;
window.getRelationshipCount = getRelationshipCount;
window.getRelationshipCountByType = getRelationshipCountByType;

window.getCanonicalPairKey = getCanonicalPairKey;

window.validateRelationshipIntegrity = validateRelationshipIntegrity;