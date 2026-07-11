/**
 * =============================================================================
 * STILL WATERS - DATA INTEGRITY SYSTEM (integrity.js)
 * =============================================================================
 * 
 * LOCATION: js/core/integrity.js
 * 
 * This file contains ALL data integrity and repair functions including:
 * - ensureDataIntegrity (core corruption prevention)
 * - Orphan cleanup (characters with missing parents, places with missing parents)
 * - Broken relationship cleanup (invalid partner references)
 * - Dangling ID cleanup (references to deleted entities)
 * - Household repair (missing members, invalid departments)
 * - Rank repair (missing rank definitions)
 * - Role repair (missing role definitions)
 * - Comprehensive audit and repair
 * 
 * This is the ANTI-CORRUPTION LAYER.
 * All long-running simulations eventually corrupt themselves.
 * This prevents that.
 * 
 * DEPENDENCIES: 
 *   - js/core/accessors.js (getCharacters, getPlaces, getRanks, getRoles, getHouseholds, 
 *                   getCharacterById, getPlaceById)
 *   - js/core/storage.js (saveMasterData)
 *   - js/core/validation.js (isValidYear - optional)
 *   - js/core/family.js (clearFamilyCache)
 * 
 * LOAD ORDER: Should be loaded AFTER accessors.js and storage.js,
 *             but BEFORE other modules that need integrity functions.
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * Core Integrity:
 *   - ensureDataIntegrity() - Ensures all data structures have required fields (called on load)
 * 
 * Orphan Cleanup (Characters & Places):
 *   - findOrphanedCharacters() - Finds characters with missing parent references
 *   - repairOrphanedCharacters() - Repairs orphaned character references (removes missing parent IDs)
 *   - findOrphanedPlaces() - Finds places with missing parent references
 *   - repairOrphanedPlaces() - Repairs orphaned place references (sets parent to null)
 * 
 * Relationship Cleanup:
 *   - findBrokenRelationships() - Finds relationships with missing partner references
 *   - repairBrokenRelationships() - Repairs broken relationships (removes invalid partner references)
 *   - findBrokenFriendships() - Finds friendships with missing friend references
 *   - repairBrokenFriendships() - Repairs broken friendships (removes invalid friend references)
 * 
 * Household Repair:
 *   - findBrokenHouseholdMembers() - Finds households with invalid member references
 *   - repairBrokenHouseholdMembers() - Repairs broken household members (removes invalid member references)
 * 
 * Rank & Role Repair:
 *   - findBrokenRankAssignments() - Finds characters with missing rank references
 *   - repairBrokenRankAssignments() - Repairs broken rank assignments (removes invalid rank references)
 *   - findBrokenRoleAssignments() - Finds characters with missing role/profession references
 *   - repairBrokenRoleAssignments() - Repairs broken role assignments (removes invalid role references)
 * 
 * Apprenticeship Repair:
 *   - findBrokenApprenticeships() - Finds broken apprenticeship references (master-apprentice mismatches)
 *   - repairBrokenApprenticeships() - Repairs broken apprenticeships (removes invalid references)
 * 
 * Comprehensive Audit & Repair:
 *   - auditDataIntegrity() - Runs full audit, returns report with counts of each issue type
 *   - repairAllData(showNotification) - Runs full repair of all integrity issues
 * 
 * Auto-Maintenance:
 *   - autoAudit() - Performs auto-audit if enough time has passed (once per day)
 *   - getTimeSinceLastAudit() - Gets time since last audit in human-readable format
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION & WRAPPERS
// =============================================================================

/**
 * Checks if required dependencies are available
 * @returns {boolean} True if all dependencies are present
 */
function _checkDependencies() {
    const required = ['getCharacters', 'getPlaces', 'getRanks', 'getRoles', 'getHouseholds', 'saveMasterData'];
    const missing = [];
    
    for (const fn of required) {
        if (typeof window[fn] !== 'function') {
            missing.push(fn);
        }
    }
    
    if (missing.length > 0) {
        console.error('Integrity.js: Missing dependencies:', missing);
        return false;
    }
    return true;
}

/**
 * Safe wrapper for getCharacterById - uses accessors.js
 */
function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') {
        return window.getCharacterById(id);
    }
    return null;
}

/**
 * Safe wrapper for getPlaceById - uses accessors.js
 */
function _getPlaceById(id) {
    if (typeof window.getPlaceById === 'function') {
        return window.getPlaceById(id);
    }
    return null;
}

/**
 * Safe wrapper for saveMasterData - uses storage.js
 */
function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

/**
 * Safe wrapper for clearFamilyCache - uses family.js
 */
function _clearFamilyCache() {
    if (typeof window.clearFamilyCache === 'function') {
        window.clearFamilyCache();
    } else if (typeof window.clearGenealogyCache === 'function') {
        // Fallback for older code
        window.clearGenealogyCache();
    }
}

/**
 * Safe wrapper for showToast - uses ui.js (optional)
 */
function _showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(message, type);
    } else {
        console.log(`[${type}] ${message}`);
    }
}

// =============================================================================
// 1. CORE DATA INTEGRITY (Called on every load)
// =============================================================================

/**
 * Ensures all data structures have required fields
 * Called automatically after loading to fix missing properties
 * This is the FIRST LINE OF DEFENSE against data corruption
 * 
 * NOTE: This function should be called from storage.js after loading data.
 * The storage.js version delegates to this one to avoid duplication.
 */
function ensureDataIntegrity() {
    // Safety check - if masterData isn't available yet, wait
    if (typeof masterData === 'undefined' || !masterData || !masterData.data) {
        console.warn('ensureDataIntegrity: masterData not available yet, skipping');
        return;
    }
    
    // Core data structures
    if (!masterData.data.rankInheritanceRules) masterData.data.rankInheritanceRules = {};
    if (!masterData.data.cityNameParts) masterData.data.cityNameParts = {};
    if (!masterData.data.households) masterData.data.households = [];
    if (!masterData.data.disasters) masterData.data.disasters = [];
    if (!masterData.data.eventLog) masterData.data.eventLog = [];
    
    // Ensure each place has required government fields
    for (const place of masterData.data.places) {
        if (place.governmentTypeId === undefined) place.governmentTypeId = null;
        if (place.governmentStyle === undefined) place.governmentStyle = null;
        if (place.leaderAssignments === undefined) place.leaderAssignments = [];
    }
    
    // Ensure each character has required arrays
    for (const char of masterData.data.characters) {
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
        
        // Ensure appearance object exists
        if (!char.appearance) char.appearance = {};
    }
    
    // Ensure each rank has required fields
    for (const rank of masterData.data.ranks) {
        if (rank.genderRestriction === undefined) rank.genderRestriction = 'either';
        if (rank.locationTypeId === undefined) rank.locationTypeId = null;
        if (rank.locationId === undefined) rank.locationId = null;
        if (rank.numbered === undefined) rank.numbered = false;
        if (rank.symbol === undefined) rank.symbol = "✦";
        if (rank.deprecateOnDeath === undefined) rank.deprecateOnDeath = false;
        if (rank.spouseInheritance === undefined) rank.spouseInheritance = null;
    }
    
    // Ensure government types have allowedRankIds array
    for (const govType of masterData.data.governmentTypes) {
        if (govType.allowedRankIds === undefined) govType.allowedRankIds = [];
    }
    
    // Ensure each household has required structure
    for (const household of masterData.data.households) {
        if (!household.departments) household.departments = [];
        if (!household.members) household.members = [];
    }
    
    // Ensure each role has required fields
    for (const role of masterData.data.roles) {
        if (role.genderRestriction === undefined) role.genderRestriction = 'both';
        if (role.specializations === undefined) role.specializations = [];
        if (role.notes === undefined) role.notes = '';
    }
}

// =============================================================================
// 2. ORPHAN CLEANUP
// =============================================================================

/**
 * Finds characters with missing parent references
 * @returns {Array} Array of orphaned character objects
 */
function findOrphanedCharacters() {
    if (!_checkDependencies()) return [];
    
    const characters = window.getCharacters();
    const orphans = [];
    
    for (const char of characters) {
        // Check for missing mother
        if (char.motherId && !_getCharacterById(char.motherId)) {
            orphans.push({ character: char, issue: 'Missing mother', refId: char.motherId });
        }
        
        // Check for missing father
        if (char.fatherId && !_getCharacterById(char.fatherId)) {
            orphans.push({ character: char, issue: 'Missing father', refId: char.fatherId });
        }
        
        // Check for missing adoptive parents
        if (char.adoptedParents) {
            for (const ap of char.adoptedParents) {
                if (!_getCharacterById(ap.parentId)) {
                    orphans.push({ character: char, issue: 'Missing adoptive parent', refId: ap.parentId });
                }
            }
        }
    }
    
    return orphans;
}

/**
 * Repairs orphaned character references (removes missing parent IDs)
 * @returns {number} Number of repairs made
 */
function repairOrphanedCharacters() {
    if (!_checkDependencies()) return 0;
    
    const orphans = findOrphanedCharacters();
    let repairs = 0;
    
    for (const orphan of orphans) {
        const char = orphan.character;
        
        if (orphan.issue === 'Missing mother' && char.motherId === orphan.refId) {
            char.motherId = null;
            repairs++;
        }
        
        if (orphan.issue === 'Missing father' && char.fatherId === orphan.refId) {
            char.fatherId = null;
            repairs++;
        }
        
        if (orphan.issue === 'Missing adoptive parent') {
            char.adoptedParents = char.adoptedParents.filter(ap => ap.parentId !== orphan.refId);
            repairs++;
        }
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

/**
 * Finds places with missing parent references
 * @returns {Array} Array of orphaned place objects
 */
function findOrphanedPlaces() {
    if (!_checkDependencies()) return [];
    
    const places = window.getPlaces();
    const orphans = [];
    
    for (const place of places) {
        if (place.parentId && !_getPlaceById(place.parentId)) {
            orphans.push({ place: place, issue: 'Missing parent', refId: place.parentId });
        }
        
        // Check for circular reference (place.parentId leads back to place)
        if (place.parentId) {
            let current = place;
            let depth = 0;
            const maxDepth = 50;
            const path = new Set();
            
            while (current && current.parentId && depth < maxDepth) {
                if (path.has(current.id)) {
                    // Circular reference detected
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

/**
 * Repairs orphaned place references (sets parent to null)
 * @returns {number} Number of repairs made
 */
function repairOrphanedPlaces() {
    if (!_checkDependencies()) return 0;
    
    const orphans = findOrphanedPlaces();
    let repairs = 0;
    
    for (const orphan of orphans) {
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
// 3. BROKEN RELATIONSHIP CLEANUP
// =============================================================================

/**
 * Finds relationships with missing partner references
 * @returns {Array} Array of broken relationship objects
 */
function findBrokenRelationships() {
    if (!_checkDependencies()) return [];
    
    const characters = window.getCharacters();
    const broken = [];
    
    for (const char of characters) {
        if (!char.relationships) continue;
        
        for (let i = 0; i < char.relationships.length; i++) {
            const rel = char.relationships[i];
            if (!_getCharacterById(rel.partnerId)) {
                broken.push({ character: char, relationship: rel, index: i });
            }
        }
    }
    
    return broken;
}

/**
 * Repairs broken relationships (removes invalid partner references)
 * @returns {number} Number of repairs made
 */
function repairBrokenRelationships() {
    if (!_checkDependencies()) return 0;
    
    const broken = findBrokenRelationships();
    let repairs = 0;
    
    for (const item of broken) {
        item.character.relationships.splice(item.index, 1);
        repairs++;
    }
    
    if (repairs > 0) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

/**
 * Finds friendships with missing friend references
 * @returns {Array} Array of broken friendships
 */
function findBrokenFriendships() {
    if (!_checkDependencies()) return [];
    
    const characters = window.getCharacters();
    const broken = [];
    
    for (const char of characters) {
        if (!char.friends) continue;
        
        for (let i = 0; i < char.friends.length; i++) {
            const friendId = char.friends[i];
            if (!_getCharacterById(friendId)) {
                broken.push({ character: char, friendId: friendId, index: i });
            }
        }
    }
    
    return broken;
}

/**
 * Repairs broken friendships (removes invalid friend references)
 * @returns {number} Number of repairs made
 */
function repairBrokenFriendships() {
    if (!_checkDependencies()) return 0;
    
    const broken = findBrokenFriendships();
    let repairs = 0;
    
    for (const item of broken) {
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
// 4. HOUSEHOLD REPAIR
// =============================================================================

/**
 * Finds households with invalid member references
 * @returns {Array} Array of broken household member references
 */
function findBrokenHouseholdMembers() {
    if (!_checkDependencies()) return [];
    
    const households = window.getHouseholds();
    const broken = [];
    
    for (const household of households) {
        if (!household.members) continue;
        
        for (let i = 0; i < household.members.length; i++) {
            const member = household.members[i];
            if (!_getCharacterById(member.characterId)) {
                broken.push({ household: household, member: member, index: i });
            }
        }
    }
    
    return broken;
}

/**
 * Repairs broken household members (removes invalid member references)
 * @returns {number} Number of repairs made
 */
function repairBrokenHouseholdMembers() {
    if (!_checkDependencies()) return 0;
    
    const broken = findBrokenHouseholdMembers();
    let repairs = 0;
    
    for (const item of broken) {
        item.household.members.splice(item.index, 1);
        repairs++;
    }
    
    // Also check for orphaned department heads
    for (const household of window.getHouseholds()) {
        if (!household.departments) continue;
        
        for (const dept of household.departments) {
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
// 5. RANK & ROLE REPAIR
// =============================================================================

/**
 * Finds characters with missing rank references
 * @returns {Array} Array of broken rank assignments
 */
function findBrokenRankAssignments() {
    if (!_checkDependencies()) return [];
    
    const characters = window.getCharacters();
    const ranks = window.getRanks();
    const rankIds = new Set(ranks.map(r => r.id));
    const broken = [];
    
    for (const char of characters) {
        if (!char.rankAssignments) continue;
        
        for (let i = 0; i < char.rankAssignments.length; i++) {
            const assignment = char.rankAssignments[i];
            if (!rankIds.has(assignment.rankId)) {
                broken.push({ character: char, assignment: assignment, index: i });
            }
        }
        
        // Also check active rank
        if (char.activeRankId && !rankIds.has(char.activeRankId)) {
            char.activeRankId = null;
            char.activeRankNumber = null;
            broken.push({ character: char, issue: 'Invalid active rank' });
        }
    }
    
    return broken;
}

/**
 * Repairs broken rank assignments (removes invalid rank references)
 * @returns {number} Number of repairs made
 */
function repairBrokenRankAssignments() {
    if (!_checkDependencies()) return 0;
    
    const broken = findBrokenRankAssignments();
    let repairs = 0;
    
    for (const item of broken) {
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

/**
 * Finds characters with missing role/profession references
 * @returns {Array} Array of broken role assignments
 */
function findBrokenRoleAssignments() {
    if (!_checkDependencies()) return [];
    
    const characters = window.getCharacters();
    const roles = window.getRoles();
    const roleIds = new Set(roles.map(r => r.id));
    const broken = [];
    
    for (const char of characters) {
        if (!char.professions) continue;
        
        for (let i = 0; i < char.professions.length; i++) {
            const prof = char.professions[i];
            if (!roleIds.has(prof.id)) {
                broken.push({ character: char, profession: prof, index: i });
            }
        }
    }
    
    return broken;
}

/**
 * Repairs broken role assignments (removes invalid role references)
 * @returns {number} Number of repairs made
 */
function repairBrokenRoleAssignments() {
    if (!_checkDependencies()) return 0;
    
    const broken = findBrokenRoleAssignments();
    let repairs = 0;
    
    for (const item of broken) {
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
// 6. APPRENTICESHIP REPAIR
// =============================================================================

/**
 * Finds broken apprenticeship references (master-apprentice mismatches)
 * @returns {Array} Array of broken apprenticeship pairs
 */
function findBrokenApprenticeships() {
    if (!_checkDependencies()) return [];
    
    const characters = window.getCharacters();
    const broken = [];
    
    for (const char of characters) {
        // Check master reference
        if (char.masterId && !_getCharacterById(char.masterId)) {
            broken.push({ character: char, issue: 'Missing master', refId: char.masterId });
        }
        
        // Check apprentices list
        if (char.apprentices) {
            for (let i = 0; i < char.apprentices.length; i++) {
                const apprenticeId = char.apprentices[i];
                const apprentice = _getCharacterById(apprenticeId);
                if (!apprentice) {
                    broken.push({ character: char, issue: 'Missing apprentice', refId: apprenticeId, index: i });
                } else if (apprentice.masterId !== char.id) {
                    // Mismatched reference
                    broken.push({ character: char, issue: 'Mismatched apprentice reference', apprentice: apprentice });
                }
            }
        }
    }
    
    return broken;
}

/**
 * Repairs broken apprenticeships (removes invalid references)
 * @returns {number} Number of repairs made
 */
function repairBrokenApprenticeships() {
    if (!_checkDependencies()) return 0;
    
    const broken = findBrokenApprenticeships();
    let repairs = 0;
    
    for (const item of broken) {
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
// 7. CACHE INVALIDATION (UPDATED to use family.js correctly)
// =============================================================================

/**
 * Invalidates all caches after repairs
 * This ensures genealogy and other cached data is refreshed
 */
function _invalidateCaches() {
    // Clear family cache using the correct function from family.js
    _clearFamilyCache();
    
    // Clear any other global caches
    if (typeof window.invalidateWorldCache === 'function') {
        window.invalidateWorldCache();
    }
    
    if (typeof window.invalidateAccessorCaches === 'function') {
        window.invalidateAccessorCaches();
    }
    
    // Legacy: clear old genealogy cache if it exists (for backward compatibility)
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
}

// =============================================================================
// 8. COMPREHENSIVE AUDIT & REPAIR
// =============================================================================

/**
 * Runs a full audit of all data integrity issues
 * @returns {Object} Audit report with counts of each issue type
 */
function auditDataIntegrity() {
    if (!_checkDependencies()) {
        return { error: 'Dependencies missing', totalIssues: -1 };
    }
    
    const report = {
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

/**
 * Runs a full repair of all data integrity issues
 * @param {boolean} showNotification - Whether to show a toast notification
 * @returns {Object} Repair report with counts of repairs made
 */
function repairAllData(showNotification = true) {
    if (!_checkDependencies()) {
        if (showNotification) {
            _showToast('Cannot repair: missing dependencies', 'error');
        }
        return { error: 'Dependencies missing', totalRepairs: 0 };
    }
    
    const before = auditDataIntegrity();
    
    const repairs = {
        orphanedCharacters: repairOrphanedCharacters(),
        orphanedPlaces: repairOrphanedPlaces(),
        brokenRelationships: repairBrokenRelationships(),
        brokenFriendships: repairBrokenFriendships(),
        brokenHouseholdMembers: repairBrokenHouseholdMembers(),
        brokenRankAssignments: repairBrokenRankAssignments(),
        brokenRoleAssignments: repairBrokenRoleAssignments(),
        brokenApprenticeships: repairBrokenApprenticeships()
    };
    
    const after = auditDataIntegrity();
    const totalRepairs = Object.values(repairs).reduce((a, b) => a + b, 0);
    
    if (showNotification && totalRepairs > 0) {
        _showToast(`Repaired ${totalRepairs} data integrity issues`, 'success');
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
// 9. AUTO-REPAIR (Periodic Maintenance)
// =============================================================================

// Load last audit time from localStorage to persist across reloads
let _lastAuditTime = 0;
const AUDIT_INTERVAL = 24 * 60 * 60 * 1000; // Once per day in milliseconds
const AUDIT_STORAGE_KEY = 'stillwaters_last_audit';

// Load persisted last audit time
try {
    const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (stored) {
        _lastAuditTime = parseInt(stored, 10) || 0;
    }
} catch (e) {
    // Ignore storage errors
}

/**
 * Performs an auto-audit if enough time has passed
 * Call this periodically (e.g., on save)
 * @returns {Object|null} Audit report if audit was performed, null otherwise
 */
function autoAudit() {
    if (!_checkDependencies()) return null;
    
    const now = Date.now();
    if (now - _lastAuditTime > AUDIT_INTERVAL) {
        _lastAuditTime = now;
        
        // Persist the audit time
        try {
            localStorage.setItem(AUDIT_STORAGE_KEY, now.toString());
        } catch (e) {
            // Ignore storage errors
        }
        
        const report = auditDataIntegrity();
        
        if (report.totalIssues > 0) {
            console.warn(`Auto-audit found ${report.totalIssues} issues. Running repair.`);
            repairAllData(true);
        }
        
        return report;
    }
    return null;
}

/**
 * Gets the time since last audit in human-readable format
 * @returns {string} Time since last audit
 */
function getTimeSinceLastAudit() {
    if (_lastAuditTime === 0) return 'Never';
    const diff = Date.now() - _lastAuditTime;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
}

// =============================================================================
// 10. REGISTER WITH STORAGE MODULE
// =============================================================================

// Register this ensureDataIntegrity with storage.js if the function exists
if (typeof window.setEnsureDataIntegrity === 'function') {
    window.setEnsureDataIntegrity(ensureDataIntegrity);
}

// =============================================================================
// 11. EXPORTS (Global Availability)
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
