/**
 * =============================================================================
 * STILL WATERS - DATA INTEGRITY SYSTEM (integrity.js)
 * =============================================================================
 * 
 * LOCATION: js/core/integrity.js
 * 
 * SINGLE SOURCE OF TRUTH for integrity detection and repair.
 * 
 * CONTRACT:
 *   - find*() functions are PURE. They never mutate canonical data.
 *   - auditDataIntegrity() is PURE. It runs find*() and returns a report.
 *   - repair*() functions mutate canonical data to fix detected issues.
 *   - repair*() functions do NOT persist. The orchestration layer decides
 *     whether to save.
 *   - repairAllData() performs repairs in memory only; the caller commits.
 *   - Missing dependencies throw. This module never silently no-ops.
 * 
 * OUT OF SCOPE:
 *   - Schema normalization → storage-schema.js
 *   - Persistence → mutation boundary / storage.js
 *   - Cache invalidation → mutation boundary
 *   - Scheduling → maintenance.js
 *   - UI feedback → caller
 * 
 * DEPENDENCIES (all REQUIRED):
 *   - accessors.js: getCharacters, getPlaces, getRanks, getRoles,
 *                   getHouseholds, getCharacterById, getPlaceById
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION
// =============================================================================

/**
 * Collects missing required dependencies.
 * @private
 * @returns {string[]}
 */
function _missingDependencies() {
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
    return missing;
}

/**
 * Throws if any required dependency is missing.
 * Missing dependencies are programmer errors, not domain data.
 */
function requireIntegrityDependencies() {
    var missing = _missingDependencies();
    if (missing.length > 0) {
        throw new Error(
            'integrity.js: missing required dependencies: ' + missing.join(', ')
        );
    }
}

// =============================================================================
// 1. ORPHAN DETECTION & REPAIR — PARENT REFERENCES
// =============================================================================

/**
 * Finds characters with broken parent references.
 * PURE. Does not mutate.
 * 
 * @returns {Array<{ character, issue, refId }>}
 */
function findBrokenParentReferences() {
    requireIntegrityDependencies();
    var characters = window.getCharacters();
    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];

        if (char.motherId && !window.getCharacterById(char.motherId)) {
            broken.push({
                character: char,
                issue: 'Missing mother',
                refId: char.motherId
            });
        }
        if (char.fatherId && !window.getCharacterById(char.fatherId)) {
            broken.push({
                character: char,
                issue: 'Missing father',
                refId: char.fatherId
            });
        }
        if (Array.isArray(char.adoptedParents)) {
            for (var j = 0; j < char.adoptedParents.length; j++) {
                var ap = char.adoptedParents[j];
                if (ap.parentId && !window.getCharacterById(ap.parentId)) {
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
 * Detects self-referencing parents and immediate parent cycles.
 * PURE.
 * 
 * @returns {Array<{ character, issue, refId }>}
 */
function findGenealogyCycles() {
    requireIntegrityDependencies();
    var characters = window.getCharacters();
    var broken = [];
    var charById = new Map();
    for (var i = 0; i < characters.length; i++) {
        if (characters[i] && characters[i].id) {
            charById.set(characters[i].id, characters[i]);
        }
    }

    for (var j = 0; j < characters.length; j++) {
        var char = characters[j];
        if (!char || !char.id) continue;

        // Self-referencing parent
        if (char.motherId === char.id) {
            broken.push({ character: char, issue: 'Self-referencing mother', refId: char.id });
        }
        if (char.fatherId === char.id) {
            broken.push({ character: char, issue: 'Self-referencing father', refId: char.id });
        }

        // Cycle detection on the parent chain
        var visited = new Set();
        visited.add(char.id);
        var current = char;
        var depth = 0;
        var maxDepth = 200; // generous safety

        while (current && depth < maxDepth) {
            var nextId = current.fatherId || current.motherId;
            if (!nextId) break;
            if (visited.has(nextId)) {
                broken.push({
                    character: char,
                    issue: 'Genealogy cycle detected',
                    refId: nextId
                });
                break;
            }
            visited.add(nextId);
            current = charById.get(nextId);
            depth++;
        }
    }
    return broken;
}

/**
 * Repairs broken parent references by nulling them out.
 * Does NOT persist. Returns the number of repairs made.
 * 
 * @returns {number}
 */
function repairBrokenParentReferences() {
    requireIntegrityDependencies();
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
    return repairs;
}

/**
 * Repairs self-references and cycles by nulling the offending reference.
 * Does NOT persist.
 * 
 * @returns {number}
 */
function repairGenealogyCycles() {
    requireIntegrityDependencies();
    var broken = findGenealogyCycles();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];
        var char = item.character;

        if (item.issue === 'Self-referencing mother' && char.motherId === char.id) {
            char.motherId = null;
            repairs++;
        } else if (item.issue === 'Self-referencing father' && char.fatherId === char.id) {
            char.fatherId = null;
            repairs++;
        } else if (item.issue === 'Genealogy cycle detected') {
            // Break the cycle at this node by nulling whichever reference
            // points into the visited set.
            if (char.fatherId && item.refId === char.fatherId) {
                char.fatherId = null;
                repairs++;
            } else if (char.motherId && item.refId === char.motherId) {
                char.motherId = null;
                repairs++;
            }
        }
    }
    return repairs;
}

// =============================================================================
// 2. PLACE HIERARCHY
// =============================================================================

/**
 * Finds places with broken parent references or circular hierarchies.
 * PURE.
 * 
 * @returns {Array<{ place, issue, refId }>}
 */
function findBrokenPlaceHierarchy() {
    requireIntegrityDependencies();
    var places = window.getPlaces();
    var broken = [];

    for (var i = 0; i < places.length; i++) {
        var place = places[i];
        if (place.parentId && !window.getPlaceById(place.parentId)) {
            broken.push({ place: place, issue: 'Missing parent', refId: place.parentId });
            continue;
        }

        if (place.parentId) {
            var visited = new Set();
            visited.add(place.id);
            var current = place;
            var depth = 0;
            var maxDepth = 200;

            while (current && current.parentId && depth < maxDepth) {
                if (visited.has(current.parentId)) {
                    broken.push({
                        place: place,
                        issue: 'Circular parent reference',
                        refId: current.parentId
                    });
                    break;
                }
                visited.add(current.parentId);
                current = window.getPlaceById(current.parentId);
                depth++;
            }
        }
    }
    return broken;
}

/**
 * Repairs broken place hierarchy by detaching broken parents.
 * Does NOT persist.
 * 
 * @returns {number}
 */
function repairBrokenPlaceHierarchy() {
    requireIntegrityDependencies();
    var broken = findBrokenPlaceHierarchy();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var orphan = broken[i];
        if (orphan.place.parentId === orphan.refId) {
            orphan.place.parentId = null;
            repairs++;
        }
    }
    return repairs;
}

// =============================================================================
// 3. RELATIONSHIPS
// =============================================================================

/**
 * Finds relationships with missing partners.
 * PURE.
 * 
 * @returns {Array<{ character, relationship, index }>}
 */
function findBrokenRelationships() {
    requireIntegrityDependencies();
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

            if (partnerId && !window.getCharacterById(partnerId)) {
                broken.push({ character: char, relationship: rel, index: j });
            }
        }
    }
    return broken;
}

/**
 * Repairs broken relationships by removing them.
 * Grouped by character; indices removed in descending order.
 * Does NOT persist.
 * 
 * @returns {number}
 */
function repairBrokenRelationships() {
    requireIntegrityDependencies();
    var broken = findBrokenRelationships();
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
            character.relationships.splice(indices[k], 1);
            repairs++;
        }
    });
    return repairs;
}

/**
 * Finds friendships with missing friend references.
 * PURE.
 */
function findBrokenFriendships() {
    requireIntegrityDependencies();
    var characters = window.getCharacters();
    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!Array.isArray(char.friends)) continue;
        for (var j = 0; j < char.friends.length; j++) {
            var friendId = char.friends[j];
            if (!window.getCharacterById(friendId)) {
                broken.push({ character: char, friendId: friendId, index: j });
            }
        }
    }
    return broken;
}

/**
 * Repairs broken friendships by removing them.
 * Does NOT persist.
 */
function repairBrokenFriendships() {
    requireIntegrityDependencies();
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
    return repairs;
}

// =============================================================================
// 4. HOUSEHOLD MEMBERS
// =============================================================================

/**
 * Finds broken household member and department head references.
 * PURE.
 */
function findBrokenHouseholdMembers() {
    requireIntegrityDependencies();
    var households = window.getHouseholds();
    var broken = [];

    for (var i = 0; i < households.length; i++) {
        var household = households[i];

        if (Array.isArray(household.members)) {
            for (var j = 0; j < household.members.length; j++) {
                var member = household.members[j];
                if (!window.getCharacterById(member.characterId)) {
                    broken.push({
                        household: household,
                        member: member,
                        index: j,
                        issue: 'Missing member'
                    });
                }
            }
        }
        if (Array.isArray(household.departments)) {
            for (var k = 0; k < household.departments.length; k++) {
                var dept = household.departments[k];
                if (dept.headId && !window.getCharacterById(dept.headId)) {
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
 * Does NOT persist.
 */
function repairBrokenHouseholdMembers() {
    requireIntegrityDependencies();
    var broken = findBrokenHouseholdMembers();
    if (broken.length === 0) return 0;

    var memberRemovals = new Map();
    var repairs = 0;

    for (var i = 0; i < broken.length; i++) {
        var item = broken[i];

        if (item.issue === 'Missing member') {
            if (!memberRemovals.has(item.household)) {
                memberRemovals.set(item.household, []);
            }
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
    return repairs;
}

// =============================================================================
// 5. RANK & ROLE ASSIGNMENTS
// =============================================================================

/**
 * Finds broken rank assignments and invalid active ranks.
 * PURE. Does NOT mutate — the repair function handles mutation.
 */
function findBrokenRankAssignments() {
    requireIntegrityDependencies();
    var characters = window.getCharacters();
    var ranks = window.getRanks();
    var rankIds = new Set();
    for (var r = 0; r < ranks.length; r++) {
        rankIds.add(ranks[r].id);
    }

    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];

        if (Array.isArray(char.rankAssignments)) {
            for (var j = 0; j < char.rankAssignments.length; j++) {
                var assignment = char.rankAssignments[j];
                if (!rankIds.has(assignment.rankId)) {
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

        if (char.activeRankId && !rankIds.has(char.activeRankId)) {
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
 * Does NOT persist.
 */
function repairBrokenRankAssignments() {
    requireIntegrityDependencies();
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
    return repairs;
}

/**
 * Finds broken role/profession assignments.
 * PURE.
 * 
 * Note: this audits DANGLING references (role no longer exists).
 * Malformed assignment shape is validation.js's concern, not integrity's.
 */
function findBrokenRoleAssignments() {
    requireIntegrityDependencies();
    var characters = window.getCharacters();
    var roles = window.getRoles();
    var roleIds = new Set();
    for (var r = 0; r < roles.length; r++) {
        roleIds.add(roles[r].id);
    }

    var broken = [];
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!Array.isArray(char.professions)) continue;
        for (var j = 0; j < char.professions.length; j++) {
            var prof = char.professions[j];
            // Canonical shape: profession.id. If the schema later adds
            // legacy aliases, migrate them before this audit runs.
            var profId = prof && prof.id;
            if (profId && !roleIds.has(profId)) {
                broken.push({ character: char, profession: prof, index: j });
            }
        }
    }
    return broken;
}

/**
 * Repairs broken role assignments.
 * Does NOT persist.
 */
function repairBrokenRoleAssignments() {
    requireIntegrityDependencies();
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
    return repairs;
}

// =============================================================================
// 6. APPRENTICESHIPS
// =============================================================================

/**
 * Finds broken apprenticeship references and contradictory references.
 * PURE.
 * 
 * Distinguishes:
 *   - dangling: masterId or apprentice entry points to a missing character
 *   - contradictory: two-sided apprenticeship records disagree
 */
function findBrokenApprenticeships() {
    requireIntegrityDependencies();
    var characters = window.getCharacters();
    var broken = [];

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];

        if (char.masterId && !window.getCharacterById(char.masterId)) {
            broken.push({
                character: char,
                issue: 'Missing master',
                refId: char.masterId,
                category: 'dangling'
            });
        }

        if (Array.isArray(char.apprentices)) {
            for (var j = 0; j < char.apprentices.length; j++) {
                var apprenticeId = char.apprentices[j];
                var apprentice = window.getCharacterById(apprenticeId);
                if (!apprentice) {
                    broken.push({
                        character: char,
                        issue: 'Missing apprentice',
                        refId: apprenticeId,
                        index: j,
                        category: 'dangling'
                    });
                } else if (apprentice.masterId !== char.id) {
                    broken.push({
                        character: char,
                        apprentice: apprentice,
                        issue: 'Mismatched apprentice reference',
                        category: 'contradictory'
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
 *   - Dangling references are removed (missing master → null the masterId;
 *     missing apprentice → drop from the apprentices list).
 *   - Contradictory references are NOT silently resolved. They are reported
 *     to the caller, who must supply a conflict policy.
 * 
 * @param {Object} [options]
 * @param {string} [options.conflictPolicy] - 'trustMasterList' | 'trustApprenticeId' | 'report' (default)
 * @returns {{ repairs: number, contradictions: Array }}
 */
function repairBrokenApprenticeships(options) {
    options = options || {};
    var policy = options.conflictPolicy || 'report';

    requireIntegrityDependencies();
    var broken = findBrokenApprenticeships();
    if (broken.length === 0) {
        return { repairs: 0, contradictions: [] };
    }

    var byChar = new Map();
    var repairs = 0;
    var contradictions = [];

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
        } else if (item.issue === 'Mismatched apprentice reference') {
            if (policy === 'trustMasterList') {
                if (item.apprentice) {
                    item.apprentice.masterId = null;
                    repairs++;
                }
            } else if (policy === 'trustApprenticeId') {
                if (!byChar.has(char)) byChar.set(char, []);
                byChar.get(char).push(item.index);
            } else {
                contradictions.push(item);
            }
        }
    }

    byChar.forEach(function(indices, character) {
        indices.sort(function(a, b) { return b - a; });
        for (var k = 0; k < indices.length; k++) {
            character.apprentices.splice(indices[k], 1);
            repairs++;
        }
    });

    return { repairs: repairs, contradictions: contradictions };
}

// =============================================================================
// 7. COMPREHENSIVE AUDIT — PURE
// =============================================================================

/**
 * Runs all finders and returns a full report.
 * PURE. Does not mutate canonical data. The result does not include
 * a timestamp — callers who want one add it themselves.
 * 
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   counts?: Object,
 *   totalIssues?: number,
 *   totalCharacters?: number,
 *   totalPlaces?: number,
 *   totalRanks?: number,
 *   totalRoles?: number,
 *   totalHouseholds?: number
 * }}
 */
function auditDataIntegrity() {
    var missing = _missingDependencies();
    if (missing.length > 0) {
        return {
            ok: false,
            error: 'Dependencies missing: ' + missing.join(', ')
        };
    }

    var brokenParents = findBrokenParentReferences();
    var cycles = findGenealogyCycles();
    var brokenPlaces = findBrokenPlaceHierarchy();
    var brokenRelationships = findBrokenRelationships();
    var brokenFriendships = findBrokenFriendships();
    var brokenHouseholdMembers = findBrokenHouseholdMembers();
    var brokenRankAssignments = findBrokenRankAssignments();
    var brokenRoleAssignments = findBrokenRoleAssignments();
    var brokenApprenticeships = findBrokenApprenticeships();

    var total = brokenParents.length
        + cycles.length
        + brokenPlaces.length
        + brokenRelationships.length
        + brokenFriendships.length
        + brokenHouseholdMembers.length
        + brokenRankAssignments.length
        + brokenRoleAssignments.length
        + brokenApprenticeships.length;

    return {
        ok: true,
        counts: {
            brokenParentReferences: brokenParents.length,
            genealogyCycles: cycles.length,
            brokenPlaceHierarchy: brokenPlaces.length,
            brokenRelationships: brokenRelationships.length,
            brokenFriendships: brokenFriendships.length,
            brokenHouseholdMembers: brokenHouseholdMembers.length,
            brokenRankAssignments: brokenRankAssignments.length,
            brokenRoleAssignments: brokenRoleAssignments.length,
            brokenApprenticeships: brokenApprenticeships.length
        },
        totalIssues: total,
        totalCharacters: window.getCharacters().length,
        totalPlaces: window.getPlaces().length,
        totalRanks: window.getRanks().length,
        totalRoles: window.getRoles().length,
        totalHouseholds: window.getHouseholds().length
    };
}

// =============================================================================
// 8. COMPREHENSIVE REPAIR
// =============================================================================

/**
 * Runs all repairs in memory only. Does NOT persist. Does NOT invalidate
 * caches. The caller is responsible for committing the mutation via the
 * mutation boundary (save + invalidate + notify).
 * 
 * @param {Object} [options]
 * @param {string} [options.conflictPolicy] - passed to apprenticeship repair
 * @returns {{
 *   repairs: Object,
 *   contradictions: Array,
 *   totalRepairs: number,
 *   changed: boolean,
 *   before: Object,
 *   after: Object
 * }}
 */
function repairAllData(options) {
    options = options || {};

    var missing = _missingDependencies();
    if (missing.length > 0) {
        throw new Error(
            'integrity.js: missing required dependencies: ' + missing.join(', ')
        );
    }

    var before = auditDataIntegrity();

    var apprenticeshipResult = repairBrokenApprenticeships({
        conflictPolicy: options.conflictPolicy
    });

    var repairs = {
        brokenParentReferences: repairBrokenParentReferences(),
        genealogyCycles: repairGenealogyCycles(),
        brokenPlaceHierarchy: repairBrokenPlaceHierarchy(),
        brokenRelationships: repairBrokenRelationships(),
        brokenFriendships: repairBrokenFriendships(),
        brokenHouseholdMembers: repairBrokenHouseholdMembers(),
        brokenRankAssignments: repairBrokenRankAssignments(),
        brokenRoleAssignments: repairBrokenRoleAssignments(),
        brokenApprenticeships: apprenticeshipResult.repairs
    };

    var totalRepairs = 0;
    for (var key in repairs) {
        if (Object.prototype.hasOwnProperty.call(repairs, key)) {
            totalRepairs += repairs[key];
        }
    }

    var after = auditDataIntegrity();

    return {
        repairs: repairs,
        contradictions: apprenticeshipResult.contradictions,
        totalRepairs: totalRepairs,
        changed: totalRepairs > 0,
        before: before,
        after: after
    };
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

// Dependency check (public, so callers can pre-flight)
window.requireIntegrityDependencies = requireIntegrityDependencies;

// Finders (pure)
window.findBrokenParentReferences = findBrokenParentReferences;
window.findGenealogyCycles = findGenealogyCycles;
window.findBrokenPlaceHierarchy = findBrokenPlaceHierarchy;
window.findBrokenRelationships = findBrokenRelationships;
window.findBrokenFriendships = findBrokenFriendships;
window.findBrokenHouseholdMembers = findBrokenHouseholdMembers;
window.findBrokenRankAssignments = findBrokenRankAssignments;
window.findBrokenRoleAssignments = findBrokenRoleAssignments;
window.findBrokenApprenticeships = findBrokenApprenticeships;

// Repairers (mutate memory; caller persists)
window.repairBrokenParentReferences = repairBrokenParentReferences;
window.repairGenealogyCycles = repairGenealogyCycles;
window.repairBrokenPlaceHierarchy = repairBrokenPlaceHierarchy;
window.repairBrokenRelationships = repairBrokenRelationships;
window.repairBrokenFriendships = repairBrokenFriendships;
window.repairBrokenHouseholdMembers = repairBrokenHouseholdMembers;
window.repairBrokenRankAssignments = repairBrokenRankAssignments;
window.repairBrokenRoleAssignments = repairBrokenRoleAssignments;
window.repairBrokenApprenticeships = repairBrokenApprenticeships;

// Comprehensive
window.auditDataIntegrity = auditDataIntegrity;
window.repairAllData = repairAllData;

// =============================================================================
// 10. DEPRECATED ALIASES
// =============================================================================

/**
 * @deprecated Alias for findBrokenParentReferences.
 */
window.findOrphanedCharacters = findBrokenParentReferences;

/**
 * @deprecated Alias for repairBrokenParentReferences.
 */
window.repairOrphanedCharacters = repairBrokenParentReferences;

/**
 * @deprecated Alias for findBrokenPlaceHierarchy.
 */
window.findOrphanedPlaces = findBrokenPlaceHierarchy;

/**
 * @deprecated Alias for repairBrokenPlaceHierarchy.
 */
window.repairOrphanedPlaces = repairBrokenPlaceHierarchy;

// =============================================================================
// 11. REMOVED (moved elsewhere)
// =============================================================================

// - ensureDataIntegrity() → storage-schema.js
// - autoAudit() / getTimeSinceLastAudit() → maintenance.js
// - All _invalidateCaches() logic → mutation boundary
// - All saveMasterData() calls → mutation boundary
// - All _showToast() calls → caller