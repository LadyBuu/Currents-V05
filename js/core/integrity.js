/**
 * =============================================================================
 * STILL WATERS - DATA INTEGRITY SYSTEM (integrity.js)
 * =============================================================================
 * 
 * LOCATION: js/core/integrity.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for data integrity detection and repair.
 * 
 * CONTRACT:
 *   - find*() functions are PURE. They never mutate canonical data.
 *   - auditDataIntegrity() is PURE. It runs find*() and returns a report.
 *   - repair*() functions mutate canonical data to fix detected issues.
 *   - repair*() functions do NOT persist by default ({ persist: false }).
 *     The orchestration layer decides whether to save.
 *   - repairAllData() runs all repairs, saves ONCE, invalidates ONCE.
 * 
 * DEPENDENCIES:
 *   - accessors.js: getCharacters, getPlaces, getRanks, getRoles,
 *                   getHouseholds, getCharacterById, getPlaceById
 *   - storage.js: saveMasterData
 *   - family-accessors.js: (indirect — clearFamilyCache is optional)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION & WRAPPERS
// =============================================================================

function _checkDependencies() {
    var required = [
        'getCharacters',
        'getPlaces',
        'getRanks',
        'getRoles',
        'getHouseholds',
        'getCharacterById',
        'getPlaceById'
    ];
    var missing = [];
    for (var i = 0; i < required.length; i++) {
        if (typeof window[required[i]] !== 'function') {
            missing.push(required[i]);
        }
    }
    if (missing.length > 0) {
        console.error('integrity.js: missing required dependencies:', missing.join(', '));
        return false;
    }
    return true;
}

function _getCharacterById(id) {
    return window.getCharacterById(id);
}

function _getPlaceById(id) {
    return window.getPlaceById(id);
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

function _invalidateCaches() {
    if (typeof window.clearFamilyCache === 'function') {
        window.clearFamilyCache();
    }
    if (typeof window.invalidateWorldCache === 'function') {
        window.invalidateWorldCache();
    }
    if (typeof window.invalidateAccessorCaches === 'function') {
        window.invalidateAccessorCaches();
    }
}

// =============================================================================
// 1. CORE DATA INTEGRITY — SCHEMA NORMALIZATION
// =============================================================================

/**
 * Ensures all top-level data structures and required fields exist.
 * Called on load. NOT the same as relational integrity (see below).
 * 
 * This is schema normalization: it guarantees the shape of the data.
 * Relational integrity (broken references) is a separate concern.
 */
function ensureDataIntegrity() {
    if (typeof masterData === 'undefined' || !masterData || !masterData.data) {
        return;
    }

    var data = masterData.data;

    // Top-level arrays — guarantee existence
    if (!Array.isArray(data.characters)) data.characters = [];
    if (!Array.isArray(data.places)) data.places = [];
    if (!Array.isArray(data.ranks)) data.ranks = [];
    if (!Array.isArray(data.roles)) data.roles = [];
    if (!Array.isArray(data.locationTypes)) data.locationTypes = [];
    if (!Array.isArray(data.governmentTypes)) data.governmentTypes = [];
    if (!Array.isArray(data.governments)) data.governments = [];
    if (!Array.isArray(data.households)) data.households = [];
    if (!Array.isArray(data.residences)) data.residences = [];
    if (!Array.isArray(data.disasters)) data.disasters = [];
    if (!Array.isArray(data.eventLog)) data.eventLog = [];
    if (!Array.isArray(data.educationalInstitutions)) data.educationalInstitutions = [];

    // Top-level objects
    if (!data.rankInheritanceRules || typeof data.rankInheritanceRules !== 'object') {
        data.rankInheritanceRules = {};
    }
    if (!data.cityNameParts || typeof data.cityNameParts !== 'object') {
        data.cityNameParts = {};
    }
    if (!data.nameLists || typeof data.nameLists !== 'object') {
        data.nameLists = {};
    }
    if (!data.educationalSubjects || typeof data.educationalSubjects !== 'object') {
        data.educationalSubjects = {};
    }
    if (!data.subjectProgress || typeof data.subjectProgress !== 'object') {
        data.subjectProgress = {};
    }

    // Place fields
    for (var p = 0; p < data.places.length; p++) {
        var place = data.places[p];
        if (place.governmentTypeId === undefined) place.governmentTypeId = null;
        if (place.governmentStyle === undefined) place.governmentStyle = null;
        if (!Array.isArray(place.leaderAssignments)) place.leaderAssignments = [];
    }

    // Character fields
    for (var c = 0; c < data.characters.length; c++) {
        var char = data.characters[c];
        if (!Array.isArray(char.relationships)) char.relationships = [];
        if (!Array.isArray(char.friends)) char.friends = [];
        if (!Array.isArray(char.moves)) char.moves = [];
        if (!Array.isArray(char.professions)) char.professions = [];
        if (!Array.isArray(char.adoptedParents)) char.adoptedParents = [];
        if (!Array.isArray(char.rankAssignments)) char.rankAssignments = [];
        if (char.isDeceased === undefined) char.isDeceased = false;
        if (!Array.isArray(char.apprentices)) char.apprentices = [];
        if (char.masterId === undefined) char.masterId = null;
        if (char.isMaster === undefined) char.isMaster = false;
        if (char.masterProfessionId === undefined) char.masterProfessionId = null;
        if (!char.apprenticeshipDetails || typeof char.apprenticeshipDetails !== 'object') {
            char.apprenticeshipDetails = {};
        }
        if (!char.friendshipDetails || typeof char.friendshipDetails !== 'object') {
            char.friendshipDetails = {};
        }
        if (!char.appearance || typeof char.appearance !== 'object') char.appearance = {};
    }

    // Rank fields
    for (var r = 0; r < data.ranks.length; r++) {
        var rank = data.ranks[r];
        if (rank.genderRestriction === undefined) rank.genderRestriction = 'either';
        if (rank.locationTypeId === undefined) rank.locationTypeId = null;
        if (rank.locationId === undefined) rank.locationId = null;
        if (rank.numbered === undefined) rank.numbered = false;
        if (rank.symbol === undefined) rank.symbol = '';
        if (rank.deprecateOnDeath === undefined) rank.deprecateOnDeath = false;
        if (rank.spouseInheritance === undefined) rank.spouseInheritance = null;
    }

    // Government type fields
    for (var g = 0; g < data.governmentTypes.length; g++) {
        var govType = data.governmentTypes[g];
        if (!Array.isArray(govType.allowedRankIds)) govType.allowedRankIds = [];
    }

    // Household fields
    for (var h = 0; h < data.households.length; h++) {
        var household = data.households[h];
        if (!Array.isArray(household.departments)) household.departments = [];
        if (!Array.isArray(household.members)) household.members = [];
    }

    // Role fields
    for (var ro = 0; ro < data.roles.length; ro++) {
        var role = data.roles[ro];
        if (role.genderRestriction === undefined) role.genderRestriction = 'both';
        if (!Array.isArray(role.specializations)) role.specializations = [];
        if (role.notes === undefined) role.notes = '';
    }
}

// =============================================================================
// 2. ORPHAN DETECTION & REPAIR — PURE FINDERS
// =============================================================================

/**
 * Finds characters with broken parent references.
 * PURE. Does not mutate.
 * @returns {Array} Array of { character, issue, refId }
 */
function findBrokenParentReferences() {
    if (!_checkDependencies()) return [];
    var characters = window.getCharacters();
    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];

        if (char.motherId && !_getCharacterById(char.motherId)) {
            broken.push({ character: char, issue: 'Missing mother', refId: char.motherId });
        }
        if (char.fatherId && !_getCharacterById(char.fatherId)) {
            broken.push({ character: char, issue: 'Missing father', refId: char.fatherId });
        }
        if (Array.isArray(char.adoptedParents)) {
            for (var j = 0; j < char.adoptedParents.length; j++) {
                var ap = char.adoptedParents[j];
                if (ap.parentId && !_getCharacterById(ap.parentId)) {
                    broken.push({
                        character: char,
                        issue: 'Missing adoptive parent',
                        refId: ap.parentId
                    });
                }
            }
        }
    }
    return broken;
}

/**
 * Repairs broken parent references by nulling them out.
 * @param {Object} options - { persist: boolean } default { persist: false }
 * @returns {number} Number of repairs made
 */
function repairBrokenParentReferences(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenParentReferences();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        var char = item.character;

        if (item.issue === 'Missing mother' && char.motherId === item.refId) {
            char.motherId = null;
            repairs++;
        }
        if (item.issue === 'Missing father' && char.fatherId === item.refId) {
            char.fatherId = null;
            repairs++;
        }
        if (item.issue === 'Missing adoptive parent' && Array.isArray(char.adoptedParents)) {
            var before = char.adoptedParents.length;
            char.adoptedParents = char.adoptedParents.filter(function(ap) {
                return ap.parentId !== item.refId;
            });
            repairs += before - char.adoptedParents.length;
        }
    }

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 3. PLACE HIERARCHY DETECTION & REPAIR
// =============================================================================

/**
 * Finds places with broken parent references or circular hierarchies.
 * PURE.
 * @returns {Array} Array of { place, issue, refId }
 */
function findBrokenPlaceHierarchy() {
    if (!_checkDependencies()) return [];
    var places = window.getPlaces();
    var broken = [];

    for (var i = 0; i < places.length; i++) {
        var place = places[i];
        if (place.parentId && !_getPlaceById(place.parentId)) {
            broken.push({ place: place, issue: 'Missing parent', refId: place.parentId });
            continue;
        }

        // Cycle detection
        if (place.parentId) {
            var path = {};
            var current = place;
            var depth = 0;
            while (current && current.parentId && depth < 50) {
                if (path[current.id]) {
                    broken.push({
                        place: place,
                        issue: 'Circular parent reference',
                        refId: current.parentId
                    });
                    break;
                }
                path[current.id] = true;
                current = _getPlaceById(current.parentId);
                depth++;
            }
        }
    }
    return broken;
}

/**
 * Repairs broken place hierarchy by detaching broken parents.
 * @param {Object} options - { persist: boolean }
 * @returns {number}
 */
function repairBrokenPlaceHierarchy(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenPlaceHierarchy();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var orphan = broken[i];
        if (orphan.place.parentId === orphan.refId) {
            orphan.place.parentId = null;
            repairs++;
        }
    }

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 4. RELATIONSHIP DETECTION & REPAIR
// =============================================================================

/**
 * Finds relationships with missing partners.
 * PURE.
 * @returns {Array} Array of { character, relationship, index }
 */
function findBrokenRelationships() {
    if (!_checkDependencies()) return [];
    var characters = window.getCharacters();
    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!Array.isArray(char.relationships)) continue;

        for (var j = 0; j < char.relationships.length; j++) {
            var rel = char.relationships[j];
            var partnerId = rel.partnerId
                || rel.participantB
                || (rel.participantA !== char.id ? rel.participantA : null);

            if (partnerId && !_getCharacterById(partnerId)) {
                broken.push({ character: char, relationship: rel, index: j });
            }
        }
    }
    return broken;
}

/**
 * Repairs broken relationships by removing them.
 * Uses grouping to avoid index-shifting bugs.
 * @param {Object} options - { persist: boolean }
 * @returns {number}
 */
function repairBrokenRelationships(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenRelationships();
    if (broken.length === 0) return 0;

    // Group by character
    var byChar = new Map();
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        if (!byChar.has(item.character)) byChar.set(item.character, []);
        byChar.get(item.character).push(item.index);
    }

    var repairs = 0;
    byChar.forEach(function(indices, character) {
        // Sort descending so splice doesn't shift earlier indices
        indices.sort(function(a, b) { return b - a; });
        for (var k = 0; k < indices.length; k++) {
            character.relationships.splice(indices[k], 1);
            repairs++;
        }
    });

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

/**
 * Finds friendships with missing friend references.
 * PURE.
 * @returns {Array}
 */
function findBrokenFriendships() {
    if (!_checkDependencies()) return [];
    var characters = window.getCharacters();
    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!Array.isArray(char.friends)) continue;
        for (var j = 0; j < char.friends.length; j++) {
            var friendId = char.friends[j];
            if (!_getCharacterById(friendId)) {
                broken.push({ character: char, friendId: friendId, index: j });
            }
        }
    }
    return broken;
}

/**
 * Repairs broken friendships by removing them.
 * @param {Object} options - { persist: boolean }
 * @returns {number}
 */
function repairBrokenFriendships(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenFriendships();
    if (broken.length === 0) return 0;

    var byChar = new Map();
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        if (!byChar.has(item.character)) byChar.set(item.character, []);
        byChar.get(item.character).push(item.index);
    }

    var repairs = 0;
    byChar.forEach(function(indices, character) {
        indices.sort(function(a, b) { return b - a; });
        for (var k = 0; k < indices.length; k++) {
            character.friends.splice(indices[k], 1);
            repairs++;
        }
    });

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 5. HOUSEHOLD MEMBER DETECTION & REPAIR
// =============================================================================

/**
 * Finds broken household member references.
 * PURE.
 * @returns {Array} Array of { household, member, index, issue }
 */
function findBrokenHouseholdMembers() {
    if (!_checkDependencies()) return [];
    var households = window.getHouseholds();
    var broken = [];

    for (var i = 0; i < households.length; i++) {
        var household = households[i];
        if (Array.isArray(household.members)) {
            for (var j = 0; j < household.members.length; j++) {
                var member = household.members[j];
                if (!_getCharacterById(member.characterId)) {
                    broken.push({ household: household, member: member, index: j, issue: 'Missing member' });
                }
            }
        }
        if (Array.isArray(household.departments)) {
            for (var k = 0; k < household.departments.length; k++) {
                var dept = household.departments[k];
                if (dept.headId && !_getCharacterById(dept.headId)) {
                    broken.push({
                        household: household,
                        department: dept,
                        departmentIndex: k,
                        issue: 'Missing department head'
                    });
                }
            }
        }
    }
    return broken;
}

/**
 * Repairs broken household members and department heads.
 * @param {Object} options - { persist: boolean }
 * @returns {number}
 */
function repairBrokenHouseholdMembers(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenHouseholdMembers();
    if (broken.length === 0) return 0;

    // Group member removals by household
    var memberRemovals = new Map();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];

        if (item.issue === 'Missing member') {
            if (!memberRemovals.has(item.household)) memberRemovals.set(item.household, []);
            memberRemovals.get(item.household).push(item.index);
        }

        if (item.issue === 'Missing department head') {
            item.department.headId = null;
            repairs++;
        }
    }

    memberRemovals.forEach(function(indices, household) {
        indices.sort(function(a, b) { return b - a; });
        for (var k = 0; k < indices.length; k++) {
            household.members.splice(indices[k], 1);
            repairs++;
        }
    });

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 6. RANK & ROLE ASSIGNMENT DETECTION & REPAIR
// =============================================================================

/**
 * Finds broken rank assignments and invalid active ranks.
 * PURE. Does NOT mutate — the caller must repair.
 * @returns {Array}
 */
function findBrokenRankAssignments() {
    if (!_checkDependencies()) return [];
    var characters = window.getCharacters();
    var ranks = window.getRanks();
    var rankIds = {};
    for (var r = 0; r < ranks.length; r++) {
        rankIds[ranks[r].id] = true;
    }

    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];

        if (Array.isArray(char.rankAssignments)) {
            for (var j = 0; j < char.rankAssignments.length; j++) {
                var assignment = char.rankAssignments[j];
                if (!rankIds[assignment.rankId]) {
                    broken.push({
                        character: char,
                        assignment: assignment,
                        index: j,
                        issue: 'Broken rank assignment',
                        refId: assignment.rankId
                    });
                }
            }
        }

        if (char.activeRankId && !rankIds[char.activeRankId]) {
            broken.push({
                character: char,
                issue: 'Invalid active rank',
                refId: char.activeRankId
            });
        }
    }
    return broken;
}

/**
 * Repairs broken rank assignments and invalid active ranks.
 * @param {Object} options - { persist: boolean }
 * @returns {number}
 */
function repairBrokenRankAssignments(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenRankAssignments();
    if (broken.length === 0) return 0;

    var byChar = new Map();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        var char = item.character;

        if (item.issue === 'Invalid active rank') {
            if (char.activeRankId === item.refId) {
                char.activeRankId = null;
                char.activeRankNumber = null;
                repairs++;
            }
            continue;
        }

        if (item.issue === 'Broken rank assignment') {
            if (!byChar.has(char)) byChar.set(char, []);
            byChar.get(char).push(item.index);
        }
    }

    byChar.forEach(function(indices, character) {
        indices.sort(function(a, b) { return b - a; });
        for (var k = 0; k < indices.length; k++) {
            character.rankAssignments.splice(indices[k], 1);
            repairs++;
        }
    });

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

/**
 * Finds broken role/profession assignments.
 * PURE.
 * @returns {Array} Array of { character, profession, index }
 */
function findBrokenRoleAssignments() {
    if (!_checkDependencies()) return [];
    var characters = window.getCharacters();
    var roles = window.getRoles();
    var roleIds = {};
    for (var r = 0; r < roles.length; r++) {
        roleIds[roles[r].id] = true;
    }

    var broken = [];
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!Array.isArray(char.professions)) continue;
        for (var j = 0; j < char.professions.length; j++) {
            var prof = char.professions[j];
            var profId = prof.id || prof.roleId;
            if (profId && !roleIds[profId]) {
                broken.push({ character: char, profession: prof, index: j });
            }
        }
    }
    return broken;
}

/**
 * Repairs broken role assignments.
 * @param {Object} options - { persist: boolean }
 * @returns {number}
 */
function repairBrokenRoleAssignments(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenRoleAssignments();
    if (broken.length === 0) return 0;

    var byChar = new Map();
    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        if (!byChar.has(item.character)) byChar.set(item.character, []);
        byChar.get(item.character).push(item.index);
    }

    var repairs = 0;
    byChar.forEach(function(indices, character) {
        indices.sort(function(a, b) { return b - a; });
        for (var k = 0; k < indices.length; k++) {
            character.professions.splice(indices[k], 1);
            repairs++;
        }
    });

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 7. APPRENTICESHIP DETECTION & REPAIR
// =============================================================================

/**
 * Finds broken apprenticeship references.
 * PURE.
 * @returns {Array}
 */
function findBrokenApprenticeships() {
    if (!_checkDependencies()) return [];
    var characters = window.getCharacters();
    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];

        if (char.masterId && !_getCharacterById(char.masterId)) {
            broken.push({ character: char, issue: 'Missing master', refId: char.masterId });
        }

        if (Array.isArray(char.apprentices)) {
            for (var j = 0; j < char.apprentices.length; j++) {
                var apprenticeId = char.apprentices[j];
                var apprentice = _getCharacterById(apprenticeId);
                if (!apprentice) {
                    broken.push({
                        character: char,
                        issue: 'Missing apprentice',
                        refId: apprenticeId,
                        index: j
                    });
                } else if (apprentice.masterId !== char.id) {
                    broken.push({
                        character: char,
                        apprentice: apprentice,
                        issue: 'Mismatched apprentice reference'
                    });
                }
            }
        }
    }
    return broken;
}

/**
 * Repairs broken apprenticeships.
 * 
 * Policy:
 *   - Missing master: null the masterId.
 *   - Missing apprentice: remove from apprentices list.
 *   - Mismatched reference: null the apprentice's masterId (trust the list).
 * 
 * @param {Object} options - { persist: boolean }
 * @returns {number}
 */
function repairBrokenApprenticeships(options) {
    options = options || {};
    var persist = options.persist === true;

    if (!_checkDependencies()) return 0;
    var broken = findBrokenApprenticeships();
    if (broken.length === 0) return 0;

    var byChar = new Map();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        var char = item.character;

        if (item.issue === 'Missing master') {
            if (char.masterId === item.refId) {
                char.masterId = null;
                repairs++;
            }
        } else if (item.issue === 'Missing apprentice') {
            if (!byChar.has(char)) byChar.set(char, []);
            byChar.get(char).push(item.index);
        } else if (item.issue === 'Mismatched apprentice reference' && item.apprentice) {
            item.apprentice.masterId = null;
            repairs++;
        }
    }

    byChar.forEach(function(indices, character) {
        indices.sort(function(a, b) { return b - a; });
        for (var k = 0; k < indices.length; k++) {
            character.apprentices.splice(indices[k], 1);
            repairs++;
        }
    });

    if (repairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }
    return repairs;
}

// =============================================================================
// 8. COMPREHENSIVE AUDIT — PURE
// =============================================================================

/**
 * Runs all finders and returns a full report.
 * PURE. Does not mutate canonical data.
 * 
 * @returns {Object} Report with counts, issues arrays, and totals
 */
function auditDataIntegrity() {
    if (!_checkDependencies()) {
        return { error: 'Dependencies missing', totalIssues: -1 };
    }

    var brokenParents = findBrokenParentReferences();
    var brokenPlaces = findBrokenPlaceHierarchy();
    var brokenRelationships = findBrokenRelationships();
    var brokenFriendships = findBrokenFriendships();
    var brokenHouseholdMembers = findBrokenHouseholdMembers();
    var brokenRankAssignments = findBrokenRankAssignments();
    var brokenRoleAssignments = findBrokenRoleAssignments();
    var brokenApprenticeships = findBrokenApprenticeships();

    var total = brokenParents.length
        + brokenPlaces.length
        + brokenRelationships.length
        + brokenFriendships.length
        + brokenHouseholdMembers.length
        + brokenRankAssignments.length
        + brokenRoleAssignments.length
        + brokenApprenticeships.length;

    return {
        brokenParentReferences: brokenParents,
        brokenPlaceHierarchy: brokenPlaces,
        brokenRelationships: brokenRelationships,
        brokenFriendships: brokenFriendships,
        brokenHouseholdMembers: brokenHouseholdMembers,
        brokenRankAssignments: brokenRankAssignments,
        brokenRoleAssignments: brokenRoleAssignments,
        brokenApprenticeships: brokenApprenticeships,
        counts: {
            brokenParentReferences: brokenParents.length,
            brokenPlaceHierarchy: brokenPlaces.length,
            brokenRelationships: brokenRelationships.length,
            brokenFriendships: brokenFriendships.length,
            brokenHouseholdMembers: brokenHouseholdMembers.length,
            brokenRankAssignments: brokenRankAssignments.length,
            brokenRoleAssignments: brokenRoleAssignments.length,
            brokenApprenticeships: brokenApprenticeships.length
        },
        totalCharacters: window.getCharacters().length,
        totalPlaces: window.getPlaces().length,
        totalRanks: window.getRanks().length,
        totalRoles: window.getRoles().length,
        totalHouseholds: window.getHouseholds().length,
        totalIssues: total,
        timestamp: Date.now()
    };
}

// =============================================================================
// 9. COMPREHENSIVE REPAIR — SINGLE SAVE, SINGLE INVALIDATE
// =============================================================================

/**
 * Runs all repairs in memory, then saves and invalidates ONCE.
 * 
 * @param {Object} options - { persist: boolean } default { persist: true }
 *   persist=true: save + invalidate after repair
 *   persist=false: mutate in memory only (caller persists)
 * @returns {Object} { repairs, totalRepairs, before, after }
 */
function repairAllData(options) {
    options = options || {};
    var persist = options.persist !== false;

    if (!_checkDependencies()) {
        return { error: 'Dependencies missing', totalRepairs: 0 };
    }

    var before = auditDataIntegrity();

    // All repairs run with persist=false; we save once at the end.
    var noPersist = { persist: false };

    var repairs = {
        brokenParentReferences: repairBrokenParentReferences(noPersist),
        brokenPlaceHierarchy: repairBrokenPlaceHierarchy(noPersist),
        brokenRelationships: repairBrokenRelationships(noPersist),
        brokenFriendships: repairBrokenFriendships(noPersist),
        brokenHouseholdMembers: repairBrokenHouseholdMembers(noPersist),
        brokenRankAssignments: repairBrokenRankAssignments(noPersist),
        brokenRoleAssignments: repairBrokenRoleAssignments(noPersist),
        brokenApprenticeships: repairBrokenApprenticeships(noPersist)
    };

    var totalRepairs = 0;
    for (var key in repairs) {
        if (repairs.hasOwnProperty(key)) totalRepairs += repairs[key];
    }

    if (totalRepairs > 0 && persist) {
        _saveMasterData();
        _invalidateCaches();
    }

    var after = auditDataIntegrity();

    return {
        repairs: repairs,
        totalRepairs: totalRepairs,
        before: before,
        after: after,
        persisted: totalRepairs > 0 && persist
    };
}

// =============================================================================
// 10. AUTO-MAINTENANCE
// =============================================================================

var _lastAuditTime = 0;
var AUDIT_INTERVAL = 24 * 60 * 60 * 1000;
var AUDIT_STORAGE_KEY = 'stillwaters_last_audit';

try {
    var stored = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (stored) {
        var parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) _lastAuditTime = parsed;
    }
} catch (e) {
    // localStorage unavailable — audit will run every load
}

/**
 * Runs an automatic audit if enough time has passed.
 * Only updates the timestamp after a successful cycle.
 * 
 * @returns {Object|null} Report of before/after, or null if skipped
 */
function autoAudit() {
    if (!_checkDependencies()) return null;

    var now = Date.now();
    if (now - _lastAuditTime <= AUDIT_INTERVAL) {
        return null;
    }

    var before = auditDataIntegrity();

    var after = before;
    if (before.totalIssues > 0) {
        var repairResult = repairAllData({ persist: true });
        after = repairResult.after;
    }

    // Only mark as audited after a successful cycle
    _lastAuditTime = now;
    try {
        localStorage.setItem(AUDIT_STORAGE_KEY, now.toString());
    } catch (e) {
        // ignore
    }

    return { before: before, after: after };
}

/**
 * Gets a human-readable string of time since last audit.
 * @returns {string}
 */
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
// 12. EXPORTS — SINGLE SOURCE OF TRUTH
// =============================================================================

// Core normalization
window.ensureDataIntegrity = ensureDataIntegrity;

// Parent references
window.findBrokenParentReferences = findBrokenParentReferences;
window.repairBrokenParentReferences = repairBrokenParentReferences;

// Place hierarchy
window.findBrokenPlaceHierarchy = findBrokenPlaceHierarchy;
window.repairBrokenPlaceHierarchy = repairBrokenPlaceHierarchy;

// Relationships
window.findBrokenRelationships = findBrokenRelationships;
window.repairBrokenRelationships = repairBrokenRelationships;
window.findBrokenFriendships = findBrokenFriendships;
window.repairBrokenFriendships = repairBrokenFriendships;

// Households
window.findBrokenHouseholdMembers = findBrokenHouseholdMembers;
window.repairBrokenHouseholdMembers = repairBrokenHouseholdMembers;

// Rank & role
window.findBrokenRankAssignments = findBrokenRankAssignments;
window.repairBrokenRankAssignments = repairBrokenRankAssignments;
window.findBrokenRoleAssignments = findBrokenRoleAssignments;
window.repairBrokenRoleAssignments = repairBrokenRoleAssignments;

// Apprenticeships
window.findBrokenApprenticeships = findBrokenApprenticeships;
window.repairBrokenApprenticeships = repairBrokenApprenticeships;

// Comprehensive
window.auditDataIntegrity = auditDataIntegrity;
window.repairAllData = repairAllData;

// Auto-maintenance
window.autoAudit = autoAudit;
window.getTimeSinceLastAudit = getTimeSinceLastAudit;

// Backward-compat aliases (old names)
window.findOrphanedCharacters = findBrokenParentReferences;
window.repairOrphanedCharacters = function(o) { return repairBrokenParentReferences(o); };
window.findOrphanedPlaces = findBrokenPlaceHierarchy;
window.repairOrphanedPlaces = function(o) { return repairBrokenPlaceHierarchy(o); };