/**
 * =============================================================================
 * STILL WATERS - DATA INTEGRITY SYSTEM (integrity.js)
 * =============================================================================
 * 
 * LOCATION: js/core/integrity.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for data integrity and repair.
 * 
 * DEPENDENCIES:
 *   - accessors.js: getCharacters, getPlaces, getRanks, getRoles, getHouseholds,
 *                   getCharacterById, getPlaceById
 *   - storage.js: saveMasterData
 *   - family.js: clearFamilyCache
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION & WRAPPERS
// =============================================================================

function _checkDependencies() {
    var required = ['getCharacters', 'getPlaces', 'getRanks', 'getRoles', 'getHouseholds', 'saveMasterData'];
    var missing = [];
    
    for (var i = 0; i < required.length; i++) {
        if (typeof window[required[i]] !== 'function') {
            missing.push(required[i]);
        }
    }
    
    if (missing.length > 0) {
        return false;
    }
    return true;
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

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

function _clearFamilyCache() {
    if (typeof window.clearFamilyCache === 'function') {
        window.clearFamilyCache();
    } else if (typeof window.clearGenealogyCache === 'function') {
        window.clearGenealogyCache();
    }
}

function _showToast(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    }
}

// =============================================================================
// 1. RECURSION GUARD
// =============================================================================

var _invalidating = false;

// =============================================================================
// 2. CACHE INVALIDATION
// =============================================================================

function _invalidateCaches() {
    if (_invalidating) {
        return;
    }
    _invalidating = true;
    
    try {
        _clearFamilyCache();
        
        if (typeof window.invalidateWorldCache === 'function') {
            window.invalidateWorldCache();
        }
        
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        
        if (typeof window._genealogyCache !== 'undefined') {
            window._genealogyCache = {
                ancestors: new Map(),
                descendants: new Map(),
                siblings: new Map(),
                parents: new Map(),
                children: new Map(),
                spouses: new Map(),
                grandparents: new Map(),
                auntsUncles: new Map(),
                cousins: new Map(),
                inLaws: new Map(),
                bloodRelation: new Map(),
                consanguinity: new Map()
            };
        }
    } catch(e) {}
    finally {
        _invalidating = false;
    }
}

// =============================================================================
// 3. CORE DATA INTEGRITY - PRIMARY DEFINITION
// =============================================================================

function ensureDataIntegrity() {
    if (typeof masterData === 'undefined' || !masterData || !masterData.data) {
        return;
    }
    
    if (!masterData.data.rankInheritanceRules) masterData.data.rankInheritanceRules = {};
    if (!masterData.data.cityNameParts) masterData.data.cityNameParts = {};
    if (!masterData.data.households) masterData.data.households = [];
    if (!masterData.data.disasters) masterData.data.disasters = [];
    if (!masterData.data.eventLog) masterData.data.eventLog = [];
    
    for (var i = 0; i < masterData.data.places.length; i++) {
        var place = masterData.data.places[i];
        if (place.governmentTypeId === undefined) place.governmentTypeId = null;
        if (place.governmentStyle === undefined) place.governmentStyle = null;
        if (place.leaderAssignments === undefined) place.leaderAssignments = [];
    }
    
    for (var i = 0; i < masterData.data.characters.length; i++) {
        var char = masterData.data.characters[i];
        if (!char.relationships) char.relationships = [];
        if (!char.friends) char.friends = [];
        if (!char.moves) char.moves = [];
        if (!char.professions) char.professions = [];
        if (!char.adoptedParents) char.adoptedParents = [];
        if (!char.rankAssignments) char.rankAssignments = [];
        if (char.isDeceased === undefined) char.isDeceased = false;
        if (char.apprentices === undefined) char.apprentices = [];
        if (char.masterId === undefined) char.masterId = null;
        if (char.isMaster === undefined) char.isMaster = false;
        if (char.masterProfessionId === undefined) char.masterProfessionId = null;
        if (char.apprenticeshipDetails === undefined) char.apprenticeshipDetails = {};
        if (char.friendshipDetails === undefined) char.friendshipDetails = {};
        if (!char.appearance) char.appearance = {};
    }
    
    for (var i = 0; i < masterData.data.ranks.length; i++) {
        var rank = masterData.data.ranks[i];
        if (rank.genderRestriction === undefined) rank.genderRestriction = 'either';
        if (rank.locationTypeId === undefined) rank.locationTypeId = null;
        if (rank.locationId === undefined) rank.locationId = null;
        if (rank.numbered === undefined) rank.numbered = false;
        if (rank.symbol === undefined) rank.symbol = '✦';
        if (rank.deprecateOnDeath === undefined) rank.deprecateOnDeath = false;
        if (rank.spouseInheritance === undefined) rank.spouseInheritance = null;
    }
    
    for (var i = 0; i < masterData.data.governmentTypes.length; i++) {
        var govType = masterData.data.governmentTypes[i];
        if (govType.allowedRankIds === undefined) govType.allowedRankIds = [];
    }
    
    for (var i = 0; i < masterData.data.households.length; i++) {
        var household = masterData.data.households[i];
        if (!household.departments) household.departments = [];
        if (!household.members) household.members = [];
    }
    
    for (var i = 0; i < masterData.data.roles.length; i++) {
        var role = masterData.data.roles[i];
        if (role.genderRestriction === undefined) role.genderRestriction = 'both';
        if (role.specializations === undefined) role.specializations = [];
        if (role.notes === undefined) role.notes = '';
    }
}

// =============================================================================
// 4. ORPHAN CLEANUP - PRIMARY DEFINITIONS
// =============================================================================

function findOrphanedCharacters() {
    if (!_checkDependencies()) return [];
    
    var characters = window.getCharacters();
    var orphans = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        
        if (char.motherId && !_getCharacterById(char.motherId)) {
            orphans.push({ character: char, issue: 'Missing mother', refId: char.motherId });
        }
        
        if (char.fatherId && !_getCharacterById(char.fatherId)) {
            orphans.push({ character: char, issue: 'Missing father', refId: char.fatherId });
        }
        
        if (char.adoptedParents) {
            for (var j = 0; j < char.adoptedParents.length; j++) {
                if (!_getCharacterById(char.adoptedParents[j].parentId)) {
                    orphans.push({ character: char, issue: 'Missing adoptive parent', refId: char.adoptedParents[j].parentId });
                }
            }
        }
    }
    
    return orphans;
}

function repairOrphanedCharacters() {
    if (!_checkDependencies()) return 0;
    
    var orphans = findOrphanedCharacters();
    var repairs = 0;
    
    for (var i = 0; i < orphans.length; i++) {
        var orphan = orphans[i];
        var char = orphan.character;
        
        if (orphan.issue === 'Missing mother' && char.motherId === orphan.refId) {
            char.motherId = null;
            repairs++;
        }
        
        if (orphan.issue === 'Missing father' && char.fatherId === orphan.refId) {
            char.fatherId = null;
            repairs++;
        }
        
        if (orphan.issue === 'Missing adoptive parent') {
            var newAdoptedParents = [];
            for (var j = 0; j < char.adoptedParents.length; j++) {
                if (char.adoptedParents[j].parentId !== orphan.refId) {
                    newAdoptedParents.push(char.adoptedParents[j]);
                }
            }
            char.adoptedParents = newAdoptedParents;
            repairs++;
        }
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

function findOrphanedPlaces() {
    if (!_checkDependencies()) return [];
    
    var places = window.getPlaces();
    var orphans = [];
    
    for (var i = 0; i < places.length; i++) {
        var place = places[i];
        if (place.parentId && !_getPlaceById(place.parentId)) {
            orphans.push({ place: place, issue: 'Missing parent', refId: place.parentId });
        }
        
        if (place.parentId) {
            var current = place;
            var depth = 0;
            var maxDepth = 50;
            var path = new Set();
            
            while (current && current.parentId && depth < maxDepth) {
                if (path.has(current.id)) {
                    orphans.push({ place: place, issue: 'Circular parent reference', refId: current.parentId });
                    break;
                }
                path.add(current.id);
                current = _getPlaceById(current.parentId);
                depth++;
            }
        }
    }
    
    return orphans;
}

function repairOrphanedPlaces() {
    if (!_checkDependencies()) return 0;
    
    var orphans = findOrphanedPlaces();
    var repairs = 0;
    
    for (var i = 0; i < orphans.length; i++) {
        var orphan = orphans[i];
        if (orphan.issue === 'Missing parent') {
            orphan.place.parentId = null;
            repairs++;
        } else if (orphan.issue === 'Circular parent reference') {
            orphan.place.parentId = null;
            repairs++;
        }
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 5. RELATIONSHIP CLEANUP - PRIMARY DEFINITIONS
// =============================================================================

function findBrokenRelationships() {
    if (!_checkDependencies()) return [];
    
    var characters = window.getCharacters();
    var broken = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!char.relationships) continue;
        
        for (var j = 0; j < char.relationships.length; j++) {
            var rel = char.relationships[j];
            if (!_getCharacterById(rel.partnerId)) {
                broken.push({ character: char, relationship: rel, index: j });
            }
        }
    }
    
    return broken;
}

function repairBrokenRelationships() {
    if (!_checkDependencies()) return 0;
    
    var broken = findBrokenRelationships();
    var repairs = 0;
    
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        item.character.relationships.splice(item.index, 1);
        repairs++;
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

function findBrokenFriendships() {
    if (!_checkDependencies()) return [];
    
    var characters = window.getCharacters();
    var broken = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!char.friends) continue;
        
        for (var j = 0; j < char.friends.length; j++) {
            var friendId = char.friends[j];
            if (!_getCharacterById(friendId)) {
                broken.push({ character: char, friendId: friendId, index: j });
            }
        }
    }
    
    return broken;
}

function repairBrokenFriendships() {
    if (!_checkDependencies()) return 0;
    
    var broken = findBrokenFriendships();
    var repairs = 0;
    
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        item.character.friends.splice(item.index, 1);
        repairs++;
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 6. HOUSEHOLD REPAIR - PRIMARY DEFINITIONS
// =============================================================================

function findBrokenHouseholdMembers() {
    if (!_checkDependencies()) return [];
    
    var households = window.getHouseholds();
    var broken = [];
    
    for (var i = 0; i < households.length; i++) {
        var household = households[i];
        if (!household.members) continue;
        
        for (var j = 0; j < household.members.length; j++) {
            var member = household.members[j];
            if (!_getCharacterById(member.characterId)) {
                broken.push({ household: household, member: member, index: j });
            }
        }
    }
    
    return broken;
}

function repairBrokenHouseholdMembers() {
    if (!_checkDependencies()) return 0;
    
    var broken = findBrokenHouseholdMembers();
    var repairs = 0;
    
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        item.household.members.splice(item.index, 1);
        repairs++;
    }
    
    for (var i = 0; i < window.getHouseholds().length; i++) {
        var household = window.getHouseholds()[i];
        if (!household.departments) continue;
        
        for (var j = 0; j < household.departments.length; j++) {
            var dept = household.departments[j];
            if (dept.headId && !_getCharacterById(dept.headId)) {
                dept.headId = null;
                repairs++;
            }
        }
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 7. RANK & ROLE REPAIR - PRIMARY DEFINITIONS
// =============================================================================

function findBrokenRankAssignments() {
    if (!_checkDependencies()) return [];
    
    var characters = window.getCharacters();
    var ranks = window.getRanks();
    var rankIds = new Set();
    for (var i = 0; i < ranks.length; i++) {
        rankIds.add(ranks[i].id);
    }
    var broken = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!char.rankAssignments) continue;
        
        for (var j = 0; j < char.rankAssignments.length; j++) {
            var assignment = char.rankAssignments[j];
            if (!rankIds.has(assignment.rankId)) {
                broken.push({ character: char, assignment: assignment, index: j });
            }
        }
        
        if (char.activeRankId && !rankIds.has(char.activeRankId)) {
            char.activeRankId = null;
            char.activeRankNumber = null;
            broken.push({ character: char, issue: 'Invalid active rank' });
        }
    }
    
    return broken;
}

function repairBrokenRankAssignments() {
    if (!_checkDependencies()) return 0;
    
    var broken = findBrokenRankAssignments();
    var repairs = 0;
    
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        if (item.index !== undefined && item.character.rankAssignments) {
            item.character.rankAssignments.splice(item.index, 1);
            repairs++;
        }
        if (item.issue === 'Invalid active rank') repairs++;
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

function findBrokenRoleAssignments() {
    if (!_checkDependencies()) return [];
    
    var characters = window.getCharacters();
    var roles = window.getRoles();
    var roleIds = new Set();
    for (var i = 0; i < roles.length; i++) {
        roleIds.add(roles[i].id);
    }
    var broken = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!char.professions) continue;
        
        for (var j = 0; j < char.professions.length; j++) {
            var prof = char.professions[j];
            if (!roleIds.has(prof.id)) {
                broken.push({ character: char, profession: prof, index: j });
            }
        }
    }
    
    return broken;
}

function repairBrokenRoleAssignments() {
    if (!_checkDependencies()) return 0;
    
    var broken = findBrokenRoleAssignments();
    var repairs = 0;
    
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        item.character.professions.splice(item.index, 1);
        repairs++;
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 8. APPRENTICESHIP REPAIR - PRIMARY DEFINITIONS
// =============================================================================

function findBrokenApprenticeships() {
    if (!_checkDependencies()) return [];
    
    var characters = window.getCharacters();
    var broken = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        
        if (char.masterId && !_getCharacterById(char.masterId)) {
            broken.push({ character: char, issue: 'Missing master', refId: char.masterId });
        }
        
        if (char.apprentices) {
            for (var j = 0; j < char.apprentices.length; j++) {
                var apprenticeId = char.apprentices[j];
                var apprentice = _getCharacterById(apprenticeId);
                if (!apprentice) {
                    broken.push({ character: char, issue: 'Missing apprentice', refId: apprenticeId, index: j });
                } else if (apprentice.masterId !== char.id) {
                    broken.push({ character: char, issue: 'Mismatched apprentice reference', apprentice: apprentice });
                }
            }
        }
    }
    
    return broken;
}

function repairBrokenApprenticeships() {
    if (!_checkDependencies()) return 0;
    
    var broken = findBrokenApprenticeships();
    var repairs = 0;
    
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        
        if (item.issue === 'Missing master' && item.character.masterId === item.refId) {
            item.character.masterId = null;
            repairs++;
        }
        
        if (item.issue === 'Missing apprentice' && item.character.apprentices) {
            item.character.apprentices.splice(item.index, 1);
            repairs++;
        }
        
        if (item.issue === 'Mismatched apprentice reference' && item.apprentice) {
            item.apprentice.masterId = null;
            repairs++;
        }
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 9. COMPREHENSIVE AUDIT & REPAIR - PRIMARY DEFINITIONS
// =============================================================================

function auditDataIntegrity() {
    if (!_checkDependencies()) {
        return { error: 'Dependencies missing', totalIssues: -1 };
    }
    
    var report = {
        orphanedCharacters: findOrphanedCharacters().length,
        orphanedPlaces: findOrphanedPlaces().length,
        brokenRelationships: findBrokenRelationships().length,
        brokenFriendships: findBrokenFriendships().length,
        brokenHouseholdMembers: findBrokenHouseholdMembers().length,
        brokenRankAssignments: findBrokenRankAssignments().length,
        brokenRoleAssignments: findBrokenRoleAssignments().length,
        brokenApprenticeships: findBrokenApprenticeships().length,
        totalCharacters: window.getCharacters().length,
        totalPlaces: window.getPlaces().length,
        totalRanks: window.getRanks().length,
        totalRoles: window.getRoles().length,
        totalHouseholds: window.getHouseholds().length,
        timestamp: Date.now()
    };
    
    report.totalIssues = report.orphanedCharacters + report.orphanedPlaces + 
                         report.brokenRelationships + report.brokenFriendships +
                         report.brokenHouseholdMembers + report.brokenRankAssignments +
                         report.brokenRoleAssignments + report.brokenApprenticeships;
    
    return report;
}

function repairAllData(showNotification) {
    showNotification = showNotification !== false;
    
    if (!_checkDependencies()) {
        if (showNotification) {
            _showToast('Cannot repair: missing dependencies', 'error');
        }
        return { error: 'Dependencies missing', totalRepairs: 0 };
    }
    
    var before = auditDataIntegrity();
    
    var repairs = {
        orphanedCharacters: repairOrphanedCharacters(),
        orphanedPlaces: repairOrphanedPlaces(),
        brokenRelationships: repairBrokenRelationships(),
        brokenFriendships: repairBrokenFriendships(),
        brokenHouseholdMembers: repairBrokenHouseholdMembers(),
        brokenRankAssignments: repairBrokenRankAssignments(),
        brokenRoleAssignments: repairBrokenRoleAssignments(),
        brokenApprenticeships: repairBrokenApprenticeships()
    };
    
    var after = auditDataIntegrity();
    var totalRepairs = 0;
    for (var key in repairs) {
        if (repairs.hasOwnProperty(key)) {
            totalRepairs += repairs[key];
        }
    }
    
    if (showNotification && totalRepairs > 0) {
        _showToast('Repaired ' + totalRepairs + ' data integrity issues', 'success');
    } else if (showNotification && totalRepairs === 0) {
        _showToast('No integrity issues found', 'info');
    }
    
    return {
        repairs: repairs,
        totalRepairs: totalRepairs,
        before: before,
        after: after
    };
}

// =============================================================================
// 10. AUTO-REPAIR - PRIMARY DEFINITIONS
// =============================================================================

var _lastAuditTime = 0;
var AUDIT_INTERVAL = 24 * 60 * 60 * 1000;
var AUDIT_STORAGE_KEY = 'stillwaters_last_audit';

try {
    var stored = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (stored) {
        _lastAuditTime = parseInt(stored, 10) || 0;
    }
} catch (e) {}

function autoAudit() {
    if (!_checkDependencies()) return null;
    
    var now = Date.now();
    if (now - _lastAuditTime > AUDIT_INTERVAL) {
        _lastAuditTime = now;
        
        try {
            localStorage.setItem(AUDIT_STORAGE_KEY, now.toString());
        } catch (e) {}
        
        var report = auditDataIntegrity();
        
        if (report.totalIssues > 0) {
            repairAllData(true);
        }
        
        return report;
    }
    return null;
}

function getTimeSinceLastAudit() {
    if (_lastAuditTime === 0) return 'Never';
    var diff = Date.now() - _lastAuditTime;
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return days + ' days ago';
}

// =============================================================================
// 11. REGISTER WITH STORAGE MODULE
// =============================================================================

if (typeof window.setEnsureDataIntegrity === 'function') {
    window.setEnsureDataIntegrity(ensureDataIntegrity);
}

// =============================================================================
// 12. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

// Core integrity
window.ensureDataIntegrity = ensureDataIntegrity;

// Orphan cleanup
window.findOrphanedCharacters = findOrphanedCharacters;
window.repairOrphanedCharacters = repairOrphanedCharacters;
window.findOrphanedPlaces = findOrphanedPlaces;
window.repairOrphanedPlaces = repairOrphanedPlaces;

// Relationship cleanup
window.findBrokenRelationships = findBrokenRelationships;
window.repairBrokenRelationships = repairBrokenRelationships;
window.findBrokenFriendships = findBrokenFriendships;
window.repairBrokenFriendships = repairBrokenFriendships;

// Household repair
window.findBrokenHouseholdMembers = findBrokenHouseholdMembers;
window.repairBrokenHouseholdMembers = repairBrokenHouseholdMembers;

// Rank & role repair
window.findBrokenRankAssignments = findBrokenRankAssignments;
window.repairBrokenRankAssignments = repairBrokenRankAssignments;
window.findBrokenRoleAssignments = findBrokenRoleAssignments;
window.repairBrokenRoleAssignments = repairBrokenRoleAssignments;

// Apprenticeship repair
window.findBrokenApprenticeships = findBrokenApprenticeships;
window.repairBrokenApprenticeships = repairBrokenApprenticeships;

// Comprehensive audit & repair
window.auditDataIntegrity = auditDataIntegrity;
window.repairAllData = repairAllData;

// Auto-maintenance
window.autoAudit = autoAudit;
window.getTimeSinceLastAudit = getTimeSinceLastAudit;