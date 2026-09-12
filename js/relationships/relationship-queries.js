/**
 * =============================================================================
 * STILL WATERS - RELATIONSHIP QUERIES
 * =============================================================================
 * 
 * PURE graph query functions - no business logic.
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (getRelationshipBetween, getRelationshipsForCharacter)
 *   - accessors.js (getCharacterById)
 *   - time.js (getCurrentYearSafe)
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

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') {
        return window.getCharacterById(id);
    }
    return null;
}

function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

function _getOngoingStatus() {
    return window.RELATIONSHIP_STATUS?.ONGOING || 'ongoing';
}

// =============================================================================
// 2. CACHING
// =============================================================================

var _socialDistanceCache = new Map();
var _pathCache = new Map();
var _recommendationCache = new Map();
var CACHE_MAX_SIZE = 1000;
var CACHE_TTL = 60000;

function _isCacheValid(timestamp) {
    return (Date.now() - timestamp) < CACHE_TTL;
}

function clearSocialDistanceCache() {
    _socialDistanceCache.clear();
    _pathCache.clear();
    _recommendationCache.clear();
}

function invalidateRelationshipCache() {
    clearSocialDistanceCache();
}

// =============================================================================
// 3. RELATIONSHIP EXISTENCE CHECKS
// =============================================================================

function hasAnyRelationship(characterIdA, characterIdB) {
    if (!characterIdA || !characterIdB) return false;
    return _getRelationshipBetween(characterIdA, characterIdB) !== null;
}

function hasRelationshipOfType(characterIdA, characterIdB, type) {
    if (typeof window.hasRelationshipOfType === 'function') {
        return window.hasRelationshipOfType(characterIdA, characterIdB, type);
    }
    if (!characterIdA || !characterIdB || !type) return false;
    var rel = _getRelationshipBetween(characterIdA, characterIdB);
    return rel !== null && rel.type === type;
}

function hasRelationshipWithStatus(characterIdA, characterIdB, status) {
    if (!characterIdA || !characterIdB || !status) return false;
    var rel = _getRelationshipBetween(characterIdA, characterIdB);
    return rel !== null && rel.status === status;
}

function hasActiveRelationship(characterIdA, characterIdB) {
    if (typeof window.hasActiveRelationship === 'function') {
        return window.hasActiveRelationship(characterIdA, characterIdB);
    }
    if (!characterIdA || !characterIdB) return false;
    var rel = _getRelationshipBetween(characterIdA, characterIdB);
    var ongoingStatus = _getOngoingStatus();
    return rel !== null && rel.status === ongoingStatus;
}

// =============================================================================
// 4. MUTUAL CONNECTIONS
// =============================================================================

function getMutualConnections(characterIdA, characterIdB, options) {
    if (!characterIdA || !characterIdB) return [];
    
    options = options || {};
    var type = options.type || null;
    var status = options.status || null;
    var includeDetails = options.includeDetails || false;
    
    var connectionsA = _getRelationshipsForCharacter(characterIdA, { status: status, type: type });
    var connectionsB = _getRelationshipsForCharacter(characterIdB, { status: status, type: type });
    
    var charAConnectedMap = new Map();
    for (var i = 0; i < connectionsA.length; i++) {
        var rel = connectionsA[i];
        var otherId = rel.participantA === characterIdA ? rel.participantB : rel.participantA;
        charAConnectedMap.set(otherId, rel);
    }
    
    var mutual = [];
    for (var i = 0; i < connectionsB.length; i++) {
        var rel = connectionsB[i];
        var otherId = rel.participantA === characterIdB ? rel.participantB : rel.participantA;
        if (charAConnectedMap.has(otherId) && otherId !== characterIdA && otherId !== characterIdB) {
            var character = _getCharacterById(otherId);
            if (character) {
                if (includeDetails) {
                    mutual.push({
                        character: character,
                        characterId: otherId,
                        relationshipWithA: {
                            type: charAConnectedMap.get(otherId).type,
                            status: charAConnectedMap.get(otherId).status,
                            relationshipId: charAConnectedMap.get(otherId).id
                        },
                        relationshipWithB: {
                            type: rel.type,
                            status: rel.status,
                            relationshipId: rel.id
                        }
                    });
                } else {
                    mutual.push(character);
                }
            }
        }
    }
    return mutual;
}

function getMutualConnectionsByType(characterIdA, characterIdB, type) {
    return getMutualConnections(characterIdA, characterIdB, { type: type });
}

function getMutualConnectionsByStatus(characterIdA, characterIdB, status) {
    return getMutualConnections(characterIdA, characterIdB, { status: status });
}

function getCommonRelationships(characterIdA, characterIdB, thirdId) {
    if (!characterIdA || !characterIdB || !thirdId) {
        return { aToThird: null, bToThird: null };
    }
    return {
        aToThird: _getRelationshipBetween(characterIdA, thirdId),
        bToThird: _getRelationshipBetween(characterIdB, thirdId)
    };
}

// =============================================================================
// 5. SOCIAL DISTANCE (DEGREES OF SEPARATION)
// =============================================================================

function _calculateSocialDistance(startId, targetId, options) {
    options = options || {};
    var maxDepth = options.maxDepth || 6;
    var type = options.type || null;
    var status = options.status || null;
    
    if (!startId || !targetId) return -1;
    if (startId === targetId) return 0;
    if (hasAnyRelationship(startId, targetId)) return 1;
    
    var visited = new Set();
    var queue = [{ id: startId, distance: 0 }];
    visited.add(startId);
    
    while (queue.length > 0) {
        var current = queue.shift();
        if (current.distance >= maxDepth) continue;
        
        var relationships = _getRelationshipsForCharacter(current.id, { status: status, type: type });
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var neighborId = rel.participantA === current.id ? rel.participantB : rel.participantA;
            if (neighborId === targetId) return current.distance + 1;
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push({ id: neighborId, distance: current.distance + 1 });
            }
        }
    }
    return -1;
}

function getSocialDistance(startId, targetId, options) {
    options = options || {};
    var useCache = options.useCache !== undefined ? options.useCache : true;
    var queryOptions = { maxDepth: options.maxDepth, type: options.type, status: options.status };
    
    if (!startId || !targetId) return -1;
    
    if (useCache) {
        var cacheKey = startId + '|' + targetId + '|' + JSON.stringify(queryOptions);
        if (_socialDistanceCache.has(cacheKey)) {
            var cached = _socialDistanceCache.get(cacheKey);
            if (cached && _isCacheValid(cached.timestamp)) return cached.value;
            _socialDistanceCache.delete(cacheKey);
        }
        var result = _calculateSocialDistance(startId, targetId, queryOptions);
        if (_socialDistanceCache.size >= CACHE_MAX_SIZE) {
            var firstKey = _socialDistanceCache.keys().next().value;
            _socialDistanceCache.delete(firstKey);
        }
        _socialDistanceCache.set(cacheKey, { value: result, timestamp: Date.now() });
        return result;
    }
    return _calculateSocialDistance(startId, targetId, queryOptions);
}

function findRelationshipPath(startId, targetId, options) {
    options = options || {};
    var maxDepth = options.maxDepth || 6;
    var type = options.type || null;
    var status = options.status || null;
    var useCache = options.useCache !== undefined ? options.useCache : true;
    
    if (!startId || !targetId) return null;
    if (startId === targetId) return [startId];
    if (hasAnyRelationship(startId, targetId)) return [startId, targetId];
    
    if (useCache) {
        var cacheKey = 'path|' + startId + '|' + targetId + '|' + JSON.stringify(options);
        if (_pathCache.has(cacheKey)) {
            var cached = _pathCache.get(cacheKey);
            if (cached && _isCacheValid(cached.timestamp)) {
                return cached.value ? cached.value.slice() : null;
            }
            _pathCache.delete(cacheKey);
        }
    }
    
    var visited = new Set([startId]);
    var queue = [{ id: startId, path: [startId] }];
    
    while (queue.length > 0) {
        var current = queue.shift();
        if (current.path.length > maxDepth) continue;
        
        var relationships = _getRelationshipsForCharacter(current.id, { status: status, type: type });
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var neighborId = rel.participantA === current.id ? rel.participantB : rel.participantA;
            if (neighborId === targetId) {
                var result = current.path.concat([neighborId]);
                if (useCache) {
                    var cacheKey2 = 'path|' + startId + '|' + targetId + '|' + JSON.stringify(options);
                    if (_pathCache.size >= CACHE_MAX_SIZE) {
                        var firstKey = _pathCache.keys().next().value;
                        _pathCache.delete(firstKey);
                    }
                    _pathCache.set(cacheKey2, { value: result.slice(), timestamp: Date.now() });
                }
                return result;
            }
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push({ id: neighborId, path: current.path.concat([neighborId]) });
            }
        }
    }
    
    if (useCache) {
        var cacheKey3 = 'path|' + startId + '|' + targetId + '|' + JSON.stringify(options);
        _pathCache.set(cacheKey3, { value: null, timestamp: Date.now() });
    }
    return null;
}

function getRelationshipPathWithMetadata(startId, targetId, options) {
    var path = findRelationshipPath(startId, targetId, options);
    if (!path) return null;
    
    var edges = [];
    for (var i = 0; i < path.length - 1; i++) {
        var rel = _getRelationshipBetween(path[i], path[i + 1]);
        if (rel) {
            edges.push({
                from: path[i],
                to: path[i + 1],
                type: rel.type,
                status: rel.status,
                relationshipId: rel.id
            });
        }
    }
    return { path: path, edges: edges };
}

function getNthDegreeConnections(characterId, degree, options) {
    if (!characterId || degree < 1) return [];
    
    options = options || {};
    var visited = new Set([characterId]);
    var queue = [{ id: characterId, distance: 0 }];
    var results = [];
    
    while (queue.length > 0) {
        var current = queue.shift();
        if (current.distance >= degree) continue;
        
        var relationships = _getRelationshipsForCharacter(current.id, options);
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var neighborId = rel.participantA === current.id ? rel.participantB : rel.participantA;
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                var newDistance = current.distance + 1;
                if (newDistance === degree) {
                    var neighbor = _getCharacterById(neighborId);
                    if (neighbor) {
                        results.push({
                            character: neighbor,
                            characterId: neighborId,
                            relationshipType: rel.type,
                            relationshipStatus: rel.status,
                            relationshipId: rel.id
                        });
                    }
                }
                queue.push({ id: neighborId, distance: newDistance });
            }
        }
    }
    return results;
}

function getCharactersWithinDistance(characterId, maxDistance, options) {
    if (!characterId || maxDistance < 1) return [];
    
    options = options || {};
    var visited = new Set([characterId]);
    var results = [];
    var queue = [{ id: characterId, distance: 0 }];
    
    while (queue.length > 0) {
        var current = queue.shift();
        if (current.distance >= maxDistance) continue;
        
        var relationships = _getRelationshipsForCharacter(current.id, options);
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var neighborId = rel.participantA === current.id ? rel.participantB : rel.participantA;
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                var neighbor = _getCharacterById(neighborId);
                if (neighbor) {
                    results.push({
                        character: neighbor,
                        characterId: neighborId,
                        distance: current.distance + 1,
                        relationshipType: rel.type,
                        relationshipStatus: rel.status,
                        relationshipId: rel.id
                    });
                }
                queue.push({ id: neighborId, distance: current.distance + 1 });
            }
        }
    }
    return results;
}

// =============================================================================
// 6. NETWORK ANALYSIS
// =============================================================================

function getRelationshipNetwork(characterId, options) {
    if (!characterId) return [];
    
    options = options || {};
    var maxDepth = options.maxDepth || 3;
    var type = options.type || null;
    var status = options.status || null;
    
    var visited = new Set([characterId]);
    var network = [];
    var queue = [{ id: characterId, depth: 0 }];
    
    while (queue.length > 0) {
        var current = queue.shift();
        if (current.depth >= maxDepth) continue;
        
        var relationships = _getRelationshipsForCharacter(current.id, { status: status, type: type });
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var neighborId = rel.participantA === current.id ? rel.participantB : rel.participantA;
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                var neighbor = _getCharacterById(neighborId);
                if (neighbor) {
                    network.push({
                        character: neighbor,
                        characterId: neighborId,
                        depth: current.depth + 1,
                        relationshipType: rel.type,
                        relationshipStatus: rel.status,
                        relationshipId: rel.id
                    });
                }
                queue.push({ id: neighborId, depth: current.depth + 1 });
            }
        }
    }
    return network;
}

function getNetworkDegree(characterId, options) {
    if (!characterId) return 0;
    options = options || {};
    var type = options.type || null;
    var status = options.status || null;
    var relationships = _getRelationshipsForCharacter(characterId, { status: status, type: type });
    return relationships.length;
}

function getRelationshipDensity(characterIds, options) {
    if (!characterIds || characterIds.length < 2) return 0;
    
    options = options || {};
    var type = options.type || null;
    var status = options.status || null;
    
    var n = characterIds.length;
    var possibleEdges = (n * (n - 1)) / 2;
    if (possibleEdges === 0) return 0;
    
    var actualEdges = 0;
    for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
            var rel = _getRelationshipBetween(characterIds[i], characterIds[j]);
            if (rel) {
                if (status && rel.status !== status) continue;
                if (type && rel.type !== type) continue;
                actualEdges++;
            }
        }
    }
    return actualEdges / possibleEdges;
}

function getCharacterNetworkStats(characterId, options) {
    if (!characterId) {
        return { totalConnections: 0, typeCounts: {}, statusCounts: {}, averageDuration: 0 };
    }
    
    options = options || {};
    var relationships = _getRelationshipsForCharacter(characterId, options);
    var currentYear = _getCurrentYear();
    var typeCounts = {};
    var statusCounts = {};
    var totalDuration = 0;
    var durationCount = 0;
    
    for (var i = 0; i < relationships.length; i++) {
        var rel = relationships[i];
        typeCounts[rel.type] = (typeCounts[rel.type] || 0) + 1;
        statusCounts[rel.status] = (statusCounts[rel.status] || 0) + 1;
        if (rel.startYear) {
            var endYear = rel.endYear || currentYear;
            totalDuration += Math.max(0, endYear - rel.startYear);
            durationCount++;
        }
    }
    
    return {
        totalConnections: relationships.length,
        typeCounts: typeCounts,
        statusCounts: statusCounts,
        averageDuration: durationCount > 0 ? totalDuration / durationCount : 0
    };
}

function getAllConnectedComponents(characterIds, options) {
    if (!characterIds || characterIds.length === 0) return [];
    
    options = options || {};
    var unvisited = new Set(characterIds);
    var components = [];
    
    while (unvisited.size > 0) {
        var startId = unvisited.values().next().value;
        var component = [];
        var queue = [startId];
        var visitedInComponent = new Set([startId]);
        
        while (queue.length > 0) {
            var current = queue.shift();
            component.push(current);
            unvisited.delete(current);
            
            var relationships = _getRelationshipsForCharacter(current, options);
            for (var i = 0; i < relationships.length; i++) {
                var rel = relationships[i];
                var neighborId = rel.participantA === current ? rel.participantB : rel.participantA;
                if (characterIds.indexOf(neighborId) !== -1 && !visitedInComponent.has(neighborId)) {
                    visitedInComponent.add(neighborId);
                    queue.push(neighborId);
                }
            }
        }
        if (component.length > 0) components.push(component);
    }
    return components;
}

function isGroupConnected(characterIds, options) {
    if (!characterIds || characterIds.length <= 1) return true;
    options = options || {};
    var components = getAllConnectedComponents(characterIds, options);
    return components.length === 1;
}

// =============================================================================
// 7. ADVANCED ANALYTICS
// =============================================================================

function getInfluenceScore(characterId, options) {
    if (!characterId) return 0;
    
    options = options || {};
    var maxDepth = options.maxDepth || 3;
    var activeOnly = options.activeOnly !== undefined ? options.activeOnly : true;
    var queryOptions = activeOnly ? { activeOnly: true } : {};
    
    var network = getRelationshipNetwork(characterId, { maxDepth: maxDepth, ...queryOptions });
    if (network.length === 0) return 0;
    
    var score = 0;
    for (var i = 0; i < network.length; i++) {
        score += 1 / (network[i].depth + 1);
    }
    
    var directConnections = getNetworkDegree(characterId, queryOptions);
    score += directConnections * 0.5;
    
    var stats = getCharacterNetworkStats(characterId, queryOptions);
    var typeDiversityBonus = Object.keys(stats.typeCounts).length * 0.2;
    score += typeDiversityBonus;
    
    var maxPossible = (maxDepth * 2) + 50;
    return Math.round((score / maxPossible) * 10000) / 100;
}

function getEgoNetwork(characterId, options) {
    if (!characterId) return { nodes: [], edges: [] };
    
    options = options || {};
    var maxDepth = options.maxDepth || 1;
    var type = options.type || null;
    var status = options.status || null;
    
    var nodes = new Map();
    var edges = [];
    var egoCharacter = _getCharacterById(characterId);
    
    if (!egoCharacter) return { nodes: [], edges: [] };
    
    nodes.set(characterId, {
        id: characterId,
        name: egoCharacter.name,
        isEgo: true
    });
    
    var visited = new Set([characterId]);
    var queue = [{ id: characterId, depth: 0 }];
    
    while (queue.length > 0) {
        var current = queue.shift();
        if (current.depth >= maxDepth) continue;
        
        var relationships = _getRelationshipsForCharacter(current.id, { status: status, type: type });
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var neighborId = rel.participantA === current.id ? rel.participantB : rel.participantA;
            var neighbor = _getCharacterById(neighborId);
            if (neighbor) {
                if (!nodes.has(neighborId)) {
                    nodes.set(neighborId, {
                        id: neighborId,
                        name: neighbor.name,
                        isEgo: false
                    });
                }
                edges.push({
                    source: current.id,
                    target: neighborId,
                    type: rel.type,
                    status: rel.status,
                    relationshipId: rel.id
                });
                if (!visited.has(neighborId) && current.depth + 1 < maxDepth) {
                    visited.add(neighborId);
                    queue.push({ id: neighborId, depth: current.depth + 1 });
                }
            }
        }
    }
    
    return { nodes: Array.from(nodes.values()), edges: edges };
}

// =============================================================================
// 8. RELATIONSHIP RECOMMENDATIONS
// =============================================================================

function getRelationshipRecommendations(characterId, options) {
    if (!characterId) return [];
    
    options = options || {};
    var maxRecommendations = options.maxRecommendations || 10;
    var minSocialDistance = options.minSocialDistance || 2;
    var maxSocialDistance = options.maxSocialDistance || 3;
    var type = options.type || null;
    var useCache = options.useCache !== undefined ? options.useCache : true;
    
    if (useCache) {
        var cacheKey = 'rec|' + characterId + '|' + minSocialDistance + '|' + maxSocialDistance + '|' + type;
        if (_recommendationCache.has(cacheKey)) {
            var cached = _recommendationCache.get(cacheKey);
            if (cached && _isCacheValid(cached.timestamp)) return cached.value;
            _recommendationCache.delete(cacheKey);
        }
    }
    
    var seen = new Set([characterId]);
    var candidates = [];
    
    for (var dist = minSocialDistance; dist <= maxSocialDistance; dist++) {
        var connections = getNthDegreeConnections(characterId, dist, { type: type });
        for (var i = 0; i < connections.length; i++) {
            var conn = connections[i];
            if (!seen.has(conn.characterId)) {
                seen.add(conn.characterId);
                var score = 1 / dist;
                candidates.push({
                    character: conn.character,
                    characterId: conn.characterId,
                    socialDistance: dist,
                    relationshipType: conn.relationshipType,
                    relationshipStatus: conn.relationshipStatus,
                    score: Math.round(score * 100) / 100
                });
            }
        }
    }
    
    var results = candidates.sort(function(a, b) { return b.score - a.score; }).slice(0, maxRecommendations);
    
    if (useCache) {
        var cacheKey2 = 'rec|' + characterId + '|' + minSocialDistance + '|' + maxSocialDistance + '|' + type;
        if (_recommendationCache.size >= CACHE_MAX_SIZE) {
            var firstKey = _recommendationCache.keys().next().value;
            _recommendationCache.delete(firstKey);
        }
        _recommendationCache.set(cacheKey2, { value: results, timestamp: Date.now() });
    }
    return results;
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.hasAnyRelationship = hasAnyRelationship;
window.hasRelationshipOfType = hasRelationshipOfType;
window.hasRelationshipWithStatus = hasRelationshipWithStatus;
window.hasActiveRelationship = hasActiveRelationship;

window.getMutualConnections = getMutualConnections;
window.getMutualConnectionsByType = getMutualConnectionsByType;
window.getMutualConnectionsByStatus = getMutualConnectionsByStatus;
window.getCommonRelationships = getCommonRelationships;

window.getSocialDistance = getSocialDistance;
window.findRelationshipPath = findRelationshipPath;
window.getRelationshipPathWithMetadata = getRelationshipPathWithMetadata;
window.getNthDegreeConnections = getNthDegreeConnections;
window.getCharactersWithinDistance = getCharactersWithinDistance;
window.clearSocialDistanceCache = clearSocialDistanceCache;
window.invalidateRelationshipCache = invalidateRelationshipCache;

window.getRelationshipNetwork = getRelationshipNetwork;
window.getNetworkDegree = getNetworkDegree;
window.getRelationshipDensity = getRelationshipDensity;
window.getCharacterNetworkStats = getCharacterNetworkStats;
window.getAllConnectedComponents = getAllConnectedComponents;
window.isGroupConnected = isGroupConnected;

window.getInfluenceScore = getInfluenceScore;
window.getEgoNetwork = getEgoNetwork;

window.getRelationshipRecommendations = getRelationshipRecommendations;