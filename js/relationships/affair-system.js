/**
 * =============================================================================
 * STILL WATERS - AFFAIR SYSTEM
 * =============================================================================
 * 
 * Affair creation, detection, consequences, and scandal impact.
 * 
 * AFFAIR TYPES:
 *   - SECRET: Hidden from society, low discovery chance
 *   - OPEN: Known to all, high discovery chance
 *   - EMOTIONAL: Emotional connection only, lower impact
 *   - ONE_NIGHT: Single encounter, ends automatically
 * 
 * CONSEQUENCES:
 *   - Discovery: Affair is revealed
 *   - Scandal: Social reputation damage
 *   - Murder: Violence resulting from affair
 *   - Execution: Legal punishment for adultery
 *   - Legitimization: Affair becomes legitimate relationship
 *   - Reconciliation: Partners reconcile after affair
 *   - Breakup: Relationship ends
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js
 *   - relationship-types.js
 *   - romance-logic.js (startCommittedRelationship, breakUp)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - time.js (getCurrentYearSafe)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. AFFAIR TYPE DEFINITIONS
// =============================================================================

window.AFFAIR_TYPES = {
    SECRET: {
        id: 'secret',
        name: 'Secret Affair',
        icon: 'LOCK',
        baseDiscoveryChance: 0.3,
        reputationImpact: 0.5,
        discoveryModifier: 1.0
    },
    OPEN: {
        id: 'open',
        name: 'Open Affair',
        icon: 'UNLOCK',
        baseDiscoveryChance: 0.9,
        reputationImpact: 0.8,
        discoveryModifier: 1.5
    },
    EMOTIONAL: {
        id: 'emotional',
        name: 'Emotional Affair',
        icon: 'HEART',
        baseDiscoveryChance: 0.2,
        reputationImpact: 0.3,
        discoveryModifier: 0.7
    },
    ONE_NIGHT: {
        id: 'one_night',
        name: 'One Night Stand',
        icon: 'STAR_4_OUTLINE',
        baseDiscoveryChance: 0.15,
        reputationImpact: 0.4,
        discoveryModifier: 0.8
    }
};

window.AFFAIR_CONSEQUENCE_TYPES = {
    DISCOVERY: 'discovery',
    SCANDAL: 'scandal',
    MURDER: 'murder',
    EXECUTION: 'execution',
    LEGITIMIZATION: 'legitimization',
    RECONCILIATION: 'reconciliation',
    BREAKUP: 'breakup'
};

window.AFFAIR_DISCOVERY_MODIFIERS = {
    RANK_HIGH: 0.3,
    RANK_MEDIUM: 0.15,
    SAME_LOCATION: 0.2,
    PUBLIC_BEHAVIOR: 0.25,
    LONG_DURATION: 0.3,
    MULTIPLE_AFFAIRS: 0.4,
    PREVIOUS_DISCOVERY: 0.5,
    SECRETIVE_PERSONALITY: -0.2
};

// =============================================================================
// 2. DEPENDENCY WRAPPERS
// =============================================================================

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
    if (typeof window.getCurrentYearSafe === 'function') {
        return window.getCurrentYearSafe();
    }
    if (typeof window.getCurrentYear === 'function') {
        return window.getCurrentYear();
    }
    return 1250;
}

function _chance(probability) {
    if (typeof window.chance === 'function') {
        return window.chance(probability);
    }
    return Math.random() < probability;
}

function _pickRandom(arr) {
    if (typeof window.pickRandom === 'function') {
        return window.pickRandom(arr);
    }
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function _randomInt(min, max) {
    if (typeof window.randomInt === 'function') {
        return window.randomInt(min, max);
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _getRelationshipBetween(idA, idB) {
    if (typeof window.getRelationshipBetween === 'function') {
        return window.getRelationshipBetween(idA, idB);
    }
    return null;
}

function _updateRelationship(relId, updates) {
    if (typeof window.updateRelationship === 'function') {
        return window.updateRelationship(relId, updates);
    }
    return null;
}

function _endRelationship(relId, endYear, reason) {
    if (typeof window.endRelationship === 'function') {
        return window.endRelationship(relId, endYear, reason);
    }
    return false;
}

function _getRelationshipsForCharacter(id, options) {
    if (typeof window.getRelationshipsForCharacter === 'function') {
        return window.getRelationshipsForCharacter(id, options);
    }
    return [];
}

function _logEvent(category, type, message, subjects) {
    if (typeof window.logEvent === 'function') {
        return window.logEvent(category, type, message, subjects);
    }
    console.log('[' + category + '] ' + type + ': ' + message);
    return true;
}

function _getRelationshipArchetypes() {
    return window.RELATIONSHIP_ARCHETYPES || {
        COMMITTED: 'committed',
        FRIENDSHIP: 'friendship'
    };
}

function _getRelationshipAttributes() {
    return window.RELATIONSHIP_ATTRIBUTES || {
        MARRIED: 'married',
        SECRET: 'secret',
        POLYAMOROUS: 'polyamorous',
        SCANDALOUS: 'scandalous'
    };
}

function _getRelationshipStatus() {
    return window.RELATIONSHIP_STATUS || {
        ONGOING: 'ongoing',
        ENDED: 'ended',
        WIDOWED: 'widowed'
    };
}

function _hasRelationshipAttribute(rel, attribute) {
    return rel?.metadata?.attributes &&
           rel.metadata.attributes.indexOf(attribute) !== -1;
}

function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') {
        return window.getCurrentLocation(character);
    }
    return 'Unknown';
}

function _getActiveRomanticRelationships(id) {
    if (typeof window.getActiveRomanticRelationships === 'function') {
        return window.getActiveRomanticRelationships(id);
    }
    return [];
}

function _startCommittedRelationship(idA, idB, options) {
    if (typeof window.startCommittedRelationship === 'function') {
        return window.startCommittedRelationship(idA, idB, options);
    }
    return null;
}

function _breakUp(idA, idB, options) {
    if (typeof window.breakUp === 'function') {
        return window.breakUp(idA, idB, options);
    }
    return null;
}

// =============================================================================
// 3. HELPER FUNCTIONS
// =============================================================================

function _getCharacterRankPriority(character) {
    if (!character || !character.activeRankId) return 5;
    if (typeof window.getRankById === 'function') {
        var rank = window.getRankById(character.activeRankId);
        if (rank && rank.priority !== undefined) return rank.priority;
    }
    return 5;
}

function _canHaveMultiplePartners(character) {
    if (typeof window.canHaveMultiplePartners === 'function') {
        return window.canHaveMultiplePartners(character.id);
    }
    if (!character) return false;
    if (character.traits && character.traits.indexOf('polygamous') !== -1) return true;
    var relationships = _getActiveRomanticRelationships(character.id);
    for (var i = 0; i < relationships.length; i++) {
        if (_hasRelationshipAttribute(relationships[i], 'polyamorous')) return true;
    }
    return false;
}

// =============================================================================
// 4. AFFAIR CREATION
// =============================================================================

function createAffair(characterAId, characterBId, options) {
    options = options || {};
    var charA = _getCharacterById(characterAId);
    var charB = _getCharacterById(characterBId);

    if (!charA || !charB) return null;
    if (characterAId === characterBId) return null;

    var existing = _getRelationshipBetween(characterAId, characterBId);
    var STATUS = _getRelationshipStatus();
    if (existing && existing.status === STATUS.ONGOING) return null;

    var startYear = options.startYear || _getCurrentYear();
    var affairTypeKey = (options.type || 'secret').toUpperCase();
    var typeConfig = window.AFFAIR_TYPES[affairTypeKey] || window.AFFAIR_TYPES.SECRET;
    var isSecret = options.isSecret !== undefined ? options.isSecret : (affairTypeKey !== 'OPEN');
    var ATTRIBUTES = _getRelationshipAttributes();

    var attributes = [];
    if (isSecret) attributes.push(ATTRIBUTES.SECRET);
    if (options.isScandalous) attributes.push(ATTRIBUTES.SCANDALOUS);

    var affair = _startCommittedRelationship(characterAId, characterBId, {
        startYear: startYear,
        attributes: attributes,
        notes: options.notes || '',
        metadata: {
            affairType: typeConfig.id,
            isSecret: isSecret,
            baseDiscoveryChance: typeConfig.baseDiscoveryChance,
            discovered: false,
            discoveryYear: null,
            discoveryCircumstances: null,
            consequences: [],
            location: _getCurrentLocation(charA),
            notes: options.notes || ''
        }
    });

    // One night stand affairs end automatically
    if (affair && typeConfig.id === 'one_night') {
        _endRelationship(affair.id, startYear, 'One night stand');
        _logEvent('affair', 'One Night Stand',
            charA.name + ' and ' + charB.name + ' had a one night stand in ' + startYear,
            [charA, charB]);
        return affair;
    }

    if (affair) {
        _logEvent('affair', 'Affair Created',
            charA.name + ' and ' + charB.name + ' began a ' + typeConfig.name,
            [charA, charB]);
    }

    return affair;
}

// =============================================================================
// 5. AFFAIR DETECTION
// =============================================================================

function getAffairDiscoveryRisk(affair) {
    if (!affair) return 0;
    var risk = affair.metadata?.baseDiscoveryChance || 0.3;
    var participants = [
        _getCharacterById(affair.participantA),
        _getCharacterById(affair.participantB)
    ];

    for (var i = 0; i < participants.length; i++) {
        var char = participants[i];
        if (!char) continue;

        var rank = _getCharacterRankPriority(char);
        if (rank <= 2) risk += window.AFFAIR_DISCOVERY_MODIFIERS.RANK_HIGH;
        else if (rank <= 3) risk += window.AFFAIR_DISCOVERY_MODIFIERS.RANK_MEDIUM;

        var otherAffairs = getAffairs(char.id).filter(function(a) { return a.id !== affair.id; });
        if (otherAffairs.length > 0) {
            risk += window.AFFAIR_DISCOVERY_MODIFIERS.MULTIPLE_AFFAIRS *
                    Math.min(0.6, otherAffairs.length * 0.2);
        }
        if (char.traits && char.traits.indexOf('secretive') !== -1) {
            risk += window.AFFAIR_DISCOVERY_MODIFIERS.SECRETIVE_PERSONALITY;
        }
    }

    var duration = getAffairDuration(affair);
    risk += window.AFFAIR_DISCOVERY_MODIFIERS.LONG_DURATION *
            Math.min(0.3, duration / 20);

    var locA = _getCurrentLocation(_getCharacterById(affair.participantA));
    var locB = _getCurrentLocation(_getCharacterById(affair.participantB));
    if (locA === locB) risk += window.AFFAIR_DISCOVERY_MODIFIERS.SAME_LOCATION;

    var typeConfig = window.AFFAIR_TYPES[affair.metadata?.affairType?.toUpperCase()];
    if (typeConfig) risk *= typeConfig.discoveryModifier;

    return Math.min(0.95, Math.max(0.05, risk));
}

function rollAffairDiscovery(affair, options) {
    if (!affair) return false;
    if (affair.metadata?.discovered) return true;

    var discoveryRisk = getAffairDiscoveryRisk(affair);
    var isDiscovered = _chance(discoveryRisk);

    if (isDiscovered) {
        var circumstances = options.circumstances || 'Suspicious behavior was noticed';
        _updateRelationship(affair.id, {
            metadata: {
                ...affair.metadata,
                discovered: true,
                discoveryYear: _getCurrentYear(),
                discoveryCircumstances: circumstances,
                discoveryRisk: discoveryRisk,
                discovererId: options.discovererId || null
            }
        });
        var charA = _getCharacterById(affair.participantA);
        var charB = _getCharacterById(affair.participantB);
        _logEvent('affair', 'Affair Discovered',
            'The affair between ' + charA?.name + ' and ' + charB?.name + ' was discovered!',
            [charA, charB]);
    }
    return isDiscovered;
}

function isAffairDiscovered(affair) {
    return affair?.metadata?.discovered === true;
}

function getAffairDiscoverer(affair) {
    if (!affair || !affair.metadata?.discovered) return null;
    var discovererId = affair.metadata?.discovererId;
    return discovererId ? _getCharacterById(discovererId) : null;
}

function getAffairDiscoveryCircumstances(affair) {
    return affair?.metadata?.discoveryCircumstances || null;
}

// =============================================================================
// 6. AFFAIR CONSEQUENCES
// =============================================================================

function triggerAffairConsequences(affair, options) {
    if (!affair) return [];
    if (affair.metadata?.consequencesTriggered) return affair.metadata.consequences || [];

    var consequences = [];
    var charA = _getCharacterById(affair.participantA);
    var charB = _getCharacterById(affair.participantB);
    if (!charA || !charB) return [];

    // Get all romantic partners (committed + casual) for both participants
    var partnersA = _getActiveRomanticRelationships(affair.participantA);
    var partnersB = _getActiveRomanticRelationships(affair.participantB);
    
    // Filter out the affair itself
    partnersA = partnersA.filter(function(r) { return r.id !== affair.id; });
    partnersB = partnersB.filter(function(r) { return r.id !== affair.id; });

    var allPartners = [...partnersA, ...partnersB];
    var partnerCharacters = [];
    for (var i = 0; i < allPartners.length; i++) {
        var rel = allPartners[i];
        var partnerId = rel.participantA === affair.participantA ? 
            rel.participantB : rel.participantA;
        var partner = _getCharacterById(partnerId);
        if (partner) partnerCharacters.push(partner);
    }

    var discoverer = null;
    if (options.discovererId) {
        discoverer = _getCharacterById(options.discovererId);
    } else if (partnerCharacters.length > 0 && affair.metadata?.discovererId) {
        discoverer = _getCharacterById(affair.metadata.discovererId);
    } else if (partnerCharacters.length > 0) {
        discoverer = _pickRandom(partnerCharacters);
    }

    var isPolyamorousA = _canHaveMultiplePartners(charA);
    var isPolyamorousB = _canHaveMultiplePartners(charB);
    var hasPartneredParticipant = (partnersA.length > 0 && !isPolyamorousA) || 
                                  (partnersB.length > 0 && !isPolyamorousB);

    // BREAKUP: If affair discovered, it may end existing relationships
    if (hasPartneredParticipant) {
        var breakupChance = options.breakupChance !== undefined ? options.breakupChance : 0.5;
        if (_chance(breakupChance)) {
            for (var i = 0; i < partnersA.length; i++) {
                var rel = partnersA[i];
                var otherId = rel.participantA === affair.participantA ? 
                    rel.participantB : rel.participantA;
                var other = _getCharacterById(otherId);
                if (other && !_canHaveMultiplePartners(other)) {
                    _breakUp(affair.participantA, otherId, {
                        endYear: _getCurrentYear(),
                        reason: 'Affair discovered'
                    });
                    consequences.push({
                        type: window.AFFAIR_CONSEQUENCE_TYPES.BREAKUP,
                        description: charA.name + ' broke up with ' + other.name + ' due to affair'
                    });
                }
            }
            for (var i = 0; i < partnersB.length; i++) {
                var rel = partnersB[i];
                var otherId = rel.participantA === affair.participantB ? 
                    rel.participantB : rel.participantA;
                var other = _getCharacterById(otherId);
                if (other && !_canHaveMultiplePartners(other)) {
                    _breakUp(affair.participantB, otherId, {
                        endYear: _getCurrentYear(),
                        reason: 'Affair discovered'
                    });
                    consequences.push({
                        type: window.AFFAIR_CONSEQUENCE_TYPES.BREAKUP,
                        description: charB.name + ' broke up with ' + other.name + ' due to affair'
                    });
                }
            }
        }

        // MURDER: Jealous partner may commit murder
        var murderChance = options.murderChance !== undefined ? options.murderChance : 0.15;
        if (discoverer && _chance(murderChance)) {
            var victim = options.victimId ? _getCharacterById(options.victimId) : 
                        (_chance(0.5) ? charA : charB);
            if (victim && typeof window.triggerMurder === 'function') {
                var murderResult = window.triggerMurder(victim, discoverer, _getCurrentYear(), {
                    murderReason: 'Affair discovery',
                    isConflictRelated: true
                });
                if (murderResult && murderResult.success) {
                    consequences.push({
                        type: window.AFFAIR_CONSEQUENCE_TYPES.MURDER,
                        description: 'Murder of ' + victim.name + ' by ' + discoverer.name,
                        details: murderResult
                    });
                }
            }
        }

        // EXECUTION: Legal punishment
        var executionChance = options.executionChance !== undefined ? options.executionChance : 0.1;
        if (_chance(executionChance) && typeof window.triggerExecution === 'function') {
            var ruler = options.rulerId ? _getCharacterById(options.rulerId) : discoverer;
            if (ruler) {
                var condemned = options.condemned || [charA, charB];
                for (var j = 0; j < condemned.length; j++) {
                    var condemnedChar = condemned[j];
                    if (condemnedChar && condemnedChar.isDeceased !== true) {
                        var execResult = window.triggerExecution(condemnedChar, _getCurrentYear(), 
                            'Adultery', { executionMethod: 'beheading' });
                        if (execResult && execResult.success) {
                            consequences.push({
                                type: window.AFFAIR_CONSEQUENCE_TYPES.EXECUTION,
                                description: 'Execution of ' + condemnedChar.name
                            });
                        }
                    }
                }
            }
        }
    }

    // SCANDAL: Always happens if discovered
    if (affair.metadata?.discovered || options.forceScandal) {
        consequences.push({
            type: window.AFFAIR_CONSEQUENCE_TYPES.SCANDAL,
            description: 'Social scandal from affair revelation'
        });
    }

    // DISCOVERY: Record discovery
    if (affair.metadata?.discovered) {
        consequences.push({
            type: window.AFFAIR_CONSEQUENCE_TYPES.DISCOVERY,
            description: 'Affair was discovered in ' + (affair.metadata.discoveryYear || _getCurrentYear())
        });
    }

    // Update affair record with consequences
    var consequenceTypes = consequences.map(function(c) { return c.type; });
    _updateRelationship(affair.id, {
        metadata: {
            ...affair.metadata,
            consequencesTriggered: true,
            consequences: consequenceTypes,
            discovererId: discoverer?.id
        }
    });

    _logEvent('scandal', 'Affair Scandal',
        'An affair between ' + charA.name + ' and ' + charB.name + ' was revealed! ' + 
        consequences.length + ' consequences triggered.',
        [charA, charB]);

    return consequences;
}

// =============================================================================
// 7. AFFAIR MANAGEMENT
// =============================================================================

function endAffair(characterAId, characterBId, options) {
    options = options || {};
    var relationship = _getRelationshipBetween(characterAId, characterBId);
    if (!relationship) return false;

    var isAffair = relationship.metadata?.affairType || 
                   _hasRelationshipAttribute(relationship, 'secret');
    if (!isAffair) return false;

    var endYear = options.endYear || _getCurrentYear();
    var reason = options.reason || 'Affair ended';

    var result = _endRelationship(relationship.id, endYear, reason);

    if (result) {
        var charA = _getCharacterById(characterAId);
        var charB = _getCharacterById(characterBId);
        _logEvent('affair', 'Affair Ended',
            'The affair between ' + charA?.name + ' and ' + charB?.name + ' ended. Reason: ' + reason,
            [charA, charB]);
    }

    return result;
}

function legitimizeAffair(characterAId, characterBId, options) {
    options = options || {};
    var affair = _getRelationshipBetween(characterAId, characterBId);
    if (!affair) return null;

    var isAffair = affair.metadata?.affairType || 
                   _hasRelationshipAttribute(affair, 'secret');
    if (!isAffair) return null;

    var legitimizationYear = options.legitimizationYear || _getCurrentYear();

    // End the affair
    endAffair(characterAId, characterBId, {
        endYear: legitimizationYear,
        reason: 'Legitimized'
    });

    // Create a legitimate committed relationship
    var newRelationship = null;
    var ATTRIBUTES = _getRelationshipAttributes();
    var attributes = options.attributes || [];

    // Remove SECRET attribute if present
    var filteredAttrs = attributes.filter(function(a) { return a !== ATTRIBUTES.SECRET; });

    if (typeof window.startCommittedRelationship === 'function') {
        newRelationship = window.startCommittedRelationship(characterAId, characterBId, {
            startYear: legitimizationYear,
            attributes: filteredAttrs,
            notes: 'Legitimized from affair',
            metadata: {
                legitimizedFromAffair: true,
                originalAffairId: affair.id
            }
        });
    }

    if (newRelationship) {
        var charA = _getCharacterById(characterAId);
        var charB = _getCharacterById(characterBId);
        _logEvent('legitimization', 'Affair Legitimized',
            'The affair between ' + charA?.name + ' and ' + charB?.name + ' was legitimized',
            [charA, charB]);
    }

    return newRelationship;
}

function reconcileAfterAffair(affair, wrongedPartyId) {
    if (!affair) return { success: false, reason: 'No affair found' };

    var wrongedParty = _getCharacterById(wrongedPartyId);
    if (!wrongedParty) return { success: false, reason: 'Wronged party not found' };

    // Find which participant was in a relationship with the wronged party
    var adulterer = null;
    var participants = [affair.participantA, affair.participantB];

    for (var i = 0; i < participants.length; i++) {
        var relationships = _getActiveRomanticRelationships(participants[i]);
        for (var j = 0; j < relationships.length; j++) {
            var rel = relationships[j];
            var partnerId = rel.participantA === participants[i] ? 
                rel.participantB : rel.participantA;
            if (partnerId === wrongedPartyId) {
                adulterer = _getCharacterById(participants[i]);
                break;
            }
        }
        if (adulterer) break;
    }

    if (!adulterer) {
        return { success: false, reason: 'Wronged party not in a relationship with affair participant' };
    }

    // Calculate reconciliation chance
    var reconciliationChance = 0.3;
    var duration = getAffairDuration(affair);

    if (duration < 1) reconciliationChance += 0.2;
    else if (duration > 5) reconciliationChance -= 0.2;

    var children = typeof window.getChildren === 'function' ? 
        window.getChildren(wrongedPartyId) : [];
    if (children.length > 0) reconciliationChance += 0.2;

    var rank = _getCharacterRankPriority(wrongedParty);
    if (rank <= 2) reconciliationChance -= 0.1;

    var affairType = affair.metadata?.affairType || 'secret';
    if (affairType === 'emotional') reconciliationChance -= 0.1;
    if (affairType === 'one_night') reconciliationChance += 0.15;

    reconciliationChance = Math.min(0.9, Math.max(0.1, reconciliationChance));

    var success = _chance(reconciliationChance);

    if (success) {
        _logEvent('reconciliation', 'Affair Reconciliation',
            wrongedParty.name + ' reconciled with ' + adulterer.name + ' after their affair',
            [wrongedParty, adulterer]);
    } else {
        _logEvent('reconciliation', 'Reconciliation Failed',
            wrongedParty.name + ' refused to reconcile with ' + adulterer.name,
            [wrongedParty, adulterer]);
    }

    return {
        success: success,
        reconciliationChance: reconciliationChance,
        wrongedParty: wrongedParty,
        adulterer: adulterer
    };
}

// =============================================================================
// 8. AFFAIR QUERIES
// =============================================================================

function getAffairs(characterId) {
    var relationships = _getRelationshipsForCharacter(characterId);
    return relationships.filter(function(r) {
        return r.metadata?.affairType || _hasRelationshipAttribute(r, 'secret');
    });
}

function getActiveAffairs(characterId) {
    var STATUS = _getRelationshipStatus();
    var affairs = getAffairs(characterId);
    return affairs.filter(function(a) {
        return a.status === STATUS.ONGOING && !a.metadata?.discovered;
    });
}

function getDiscoveredAffairs(characterId) {
    var affairs = getAffairs(characterId);
    return affairs.filter(function(a) {
        return a.metadata?.discovered === true;
    });
}

function getAffairDuration(affair, currentYear) {
    if (!affair) return 0;
    var startYear = affair.startYear;
    var endYear = affair.endYear || currentYear || _getCurrentYear();
    return Math.max(0, endYear - startYear);
}

function isHavingAffair(characterId) {
    return getActiveAffairs(characterId).length > 0;
}

function getAffairBetween(characterAId, characterBId) {
    var relationship = _getRelationshipBetween(characterAId, characterBId);
    if (relationship && (relationship.metadata?.affairType || 
        _hasRelationshipAttribute(relationship, 'secret'))) {
        return relationship;
    }
    return null;
}

function getAffairStatistics(characterId) {
    var affairs = getAffairs(characterId);
    var active = affairs.filter(function(a) {
        return !a.metadata?.discovered && a.status === 'ongoing';
    });
    var discovered = affairs.filter(function(a) {
        return a.metadata?.discovered === true;
    });
    var ended = affairs.filter(function(a) {
        return a.status === 'ended';
    });

    var totalDuration = 0;
    for (var i = 0; i < affairs.length; i++) {
        totalDuration += getAffairDuration(affairs[i]);
    }

    var typeCounts = {};
    for (var i = 0; i < affairs.length; i++) {
        var type = affairs[i].metadata?.affairType || 'secret';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    return {
        totalAffairs: affairs.length,
        activeAffairs: active.length,
        discoveredAffairs: discovered.length,
        endedAffairs: ended.length,
        averageDuration: affairs.length > 0 ? totalDuration / affairs.length : 0,
        typeBreakdown: typeCounts,
        hasActiveAffair: active.length > 0
    };
}

function getAffairTypeName(affairTypeId) {
    var type = window.AFFAIR_TYPES[affairTypeId?.toUpperCase()];
    return type?.name || affairTypeId || 'Unknown';
}

function getAffairTypeIcon(affairTypeId) {
    var type = window.AFFAIR_TYPES[affairTypeId?.toUpperCase()];
    return type?.icon || 'CIRCLE_DOT';
}

// =============================================================================
// 9. SCANDAL IMPACT
// =============================================================================

function calculateScandalImpact(affair) {
    if (!affair) return { impact: 0, reputationLoss: 0 };

    var totalImpact = 0;
    var impacts = {};
    var participants = [affair.participantA, affair.participantB];

    for (var i = 0; i < participants.length; i++) {
        var character = _getCharacterById(participants[i]);
        if (!character) continue;

        var reputationLoss = 20;
        var rank = _getCharacterRankPriority(character);
        if (rank <= 2) reputationLoss += 30;
        else if (rank <= 3) reputationLoss += 15;

        var partners = _getActiveRomanticRelationships(participants[i]);
        if (partners.length === 0) reputationLoss -= 10;

        var affairType = affair.metadata?.affairType || 'secret';
        if (affairType === 'open') reputationLoss += 10;
        if (affair.metadata?.discovered) reputationLoss += 15;

        impacts[participants[i]] = {
            reputationLoss: Math.min(80, reputationLoss),
            scandalMagnitude: reputationLoss / 10,
            affairType: affairType,
            discovered: affair.metadata?.discovered || false
        };
        totalImpact += reputationLoss;
    }

    return {
        totalImpact: totalImpact,
        participants: impacts
    };
}

// =============================================================================
// 10. BULK OPERATIONS
// =============================================================================

function endAllAffairsForCharacter(characterId, options) {
    options = options || {};
    var reason = options.reason || 'Character ended all affairs';
    var affairs = getAffairs(characterId);
    var ended = 0;

    for (var i = 0; i < affairs.length; i++) {
        var affair = affairs[i];
        var otherPartyId = affair.participantA === characterId ? 
            affair.participantB : affair.participantA;
        if (endAffair(characterId, otherPartyId, {
            endYear: options.endYear || _getCurrentYear(),
            reason: reason
        })) {
            ended++;
        }
    }
    return ended;
}

function processAnnualAffairs() {
    var allChars = _getCharacters();
    var discoveries = [];

    for (var i = 0; i < allChars.length; i++) {
        var char = allChars[i];
        if (char.isDeceased) continue;

        var affairs = getActiveAffairs(char.id);
        for (var j = 0; j < affairs.length; j++) {
            var affair = affairs[j];
            var risk = getAffairDiscoveryRisk(affair);
            if (_chance(risk * 0.15)) { // 15% of risk per year
                var discovered = rollAffairDiscovery(affair);
                if (discovered) {
                    var consequences = triggerAffairConsequences(affair);
                    discoveries.push({
                        affair: affair,
                        consequences: consequences
                    });
                }
            }
        }
    }

    if (discoveries.length > 0) {
        _logEvent('affair', 'Annual Processing',
            discoveries.length + ' affair(s) were discovered this year',
            []);
    }

    return discoveries;
}

// =============================================================================
// 11. EXPORTS
// =============================================================================

window.AFFAIR_TYPES = window.AFFAIR_TYPES;
window.AFFAIR_CONSEQUENCE_TYPES = window.AFFAIR_CONSEQUENCE_TYPES;
window.AFFAIR_DISCOVERY_MODIFIERS = window.AFFAIR_DISCOVERY_MODIFIERS;

window.createAffair = createAffair;
window.getAffairDiscoveryRisk = getAffairDiscoveryRisk;
window.rollAffairDiscovery = rollAffairDiscovery;
window.isAffairDiscovered = isAffairDiscovered;
window.getAffairDiscoverer = getAffairDiscoverer;
window.getAffairDiscoveryCircumstances = getAffairDiscoveryCircumstances;
window.triggerAffairConsequences = triggerAffairConsequences;
window.endAffair = endAffair;
window.legitimizeAffair = legitimizeAffair;
window.reconcileAfterAffair = reconcileAfterAffair;

window.getAffairs = getAffairs;
window.getActiveAffairs = getActiveAffairs;
window.getDiscoveredAffairs = getDiscoveredAffairs;
window.getAffairDuration = getAffairDuration;
window.isHavingAffair = isHavingAffair;
window.getAffairBetween = getAffairBetween;
window.getAffairStatistics = getAffairStatistics;
window.getAffairTypeName = getAffairTypeName;
window.getAffairTypeIcon = getAffairTypeIcon;

window.calculateScandalImpact = calculateScandalImpact;

window.endAllAffairsForCharacter = endAllAffairsForCharacter;
window.processAnnualAffairs = processAnnualAffairs;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AFFAIR_TYPES: window.AFFAIR_TYPES,
        AFFAIR_CONSEQUENCE_TYPES: window.AFFAIR_CONSEQUENCE_TYPES,
        AFFAIR_DISCOVERY_MODIFIERS: window.AFFAIR_DISCOVERY_MODIFIERS,
        createAffair: createAffair,
        getAffairDiscoveryRisk: getAffairDiscoveryRisk,
        rollAffairDiscovery: rollAffairDiscovery,
        isAffairDiscovered: isAffairDiscovered,
        getAffairDiscoverer: getAffairDiscoverer,
        getAffairDiscoveryCircumstances: getAffairDiscoveryCircumstances,
        triggerAffairConsequences: triggerAffairConsequences,
        endAffair: endAffair,
        legitimizeAffair: legitimizeAffair,
        reconcileAfterAffair: reconcileAfterAffair,
        getAffairs: getAffairs,
        getActiveAffairs: getActiveAffairs,
        getDiscoveredAffairs: getDiscoveredAffairs,
        getAffairDuration: getAffairDuration,
        isHavingAffair: isHavingAffair,
        getAffairBetween: getAffairBetween,
        getAffairStatistics: getAffairStatistics,
        getAffairTypeName: getAffairTypeName,
        getAffairTypeIcon: getAffairTypeIcon,
        calculateScandalImpact: calculateScandalImpact,
        endAllAffairsForCharacter: endAllAffairsForCharacter,
        processAnnualAffairs: processAnnualAffairs
    };
}