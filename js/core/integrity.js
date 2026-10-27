/**
 * =============================================================================
 * STILL WATERS - DATA INTEGRITY SYSTEM (integrity.js)
 * =============================================================================
 *
 * LOCATION: js/core/integrity.js
 *
 * SINGLE SOURCE OF TRUTH for cross-entity referential integrity detection
 * and repair.
 *
 * CONTRACT:
 *   - find*() functions are PURE. They never mutate canonical data.
 *     They may return LIVE canonical entity references in their results;
 *     callers must treat those as read-only. Copying every entity for
 *     purity would be wasteful and repair needs the live references.
 *   - auditDataIntegrity() is PURE. It runs find*() and returns a report.
 *   - repair*() functions mutate canonical data to fix detected issues.
 *   - repair*() functions do NOT persist. The orchestration layer decides
 *     whether to save.
 *   - repairAllData() performs repairs in memory only; the caller commits.
 *   - Missing dependencies throw. This module never silently no-ops.
 *   - Malformed entity shape is validation.js's concern. Integrity only
 *     audits well-formed references for dangling targets and contradictory
 *     graph relationships.
 *
 * OUT OF SCOPE:
 *   - Schema normalization → storage-schema.js
 *   - Shape/semantic validation of individual entities → validation.js
 *   - Persistence → mutation boundary / storage.js
 *   - Cache invalidation → mutation boundary
 *   - Scheduling → maintenance.js
 *   - UI feedback → caller
 *
 * PARENTAGE:
 *   Parentage lives in FamilyState (parentChildEdges). The character
 *   record does NOT carry motherId, fatherId, children, adoptedParents,
 *   or adoptedChildren — those are removed fields. See the REMOVED
 *   FIELDS note in storage-schema.js and the PARENTAGE note in
 *   validation.js.
 *
 *   This module therefore does NOT audit parent references on the
 *   character record. Family edge integrity (dangling parent ids,
 *   genealogy cycles) is owned by family-state.js + family-commands.js
 *   and audited by their own finders (or by future work in this module
 *   if family integrity is folded in — see FUTURE WORK below).
 *
 *   Earlier revisions of findBrokenParentReferences read char.motherId,
 *   char.fatherId, and char.adoptedParents. All three fields are removed
 *   from the canonical schema. Reading them returned undefined for every
 *   character, so the finder produced no findings. The dead code has been
 *   removed. findGenealogyCycles has also been removed (it walked the
 *   same removed fields via _parentEdges).
 *
 * RELATIONSHIP SCHEMA:
 *   This module audits the CANONICAL relationship shape only. Legacy
 *   representations must be migrated before integrity runs. Do not add
 *   fallback field lookups here; if a relationship uses a field that is
 *   no longer canonical, that is a migration problem.
 *
 * APPRENTICESHIP CONFLICT POLICIES:
 *   trustMasterList:  master.apprentices lists are authoritative;
 *                     rebuild each apprentice's masterId from them.
 *   trustApprenticeId: apprentice.masterId is authoritative;
 *                     rebuild each master's apprentices lists from them.
 *   report (default): detect contradictions, do not resolve them.
 *
 *   These are GRAPH RECONCILIATION policies, not per-finding patches.
 *   Applying them may touch entries that were not themselves flagged as
 *   contradictory, because reconciling one side of the graph requires
 *   updating the other side to match.
 *
 * FUTURE WORK (family integrity):
 *   Family edge integrity (dangling parentId, genealogy cycles across
 *   parentChildEdges) is NOT audited by this module. It belongs to the
 *   family domain. When it is added, the finders should be named
 *   findBrokenFamilyEdges / findFamilyGenealogyCycles and should live in
 *   family-queries.js or a new family-integrity.js — NOT be resurrected
 *   here against the character record.
 *
 * DEPENDENCIES (all REQUIRED):
 *   - accessors.js: getCharacters, getPlaces, getRanks, getRoles,
 *                   getHouseholds, getCharacterById, getPlaceById
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed findBrokenParentReferences, repairBrokenParentReferences,
 *       findGenealogyCycles, repairGenealogyCycles, and the private
 *       _parentEdges helper. All five read removed character-record
 *       fields (motherId, fatherId, adoptedParents). They produced no
 *       findings on any current save because the fields are gone.
 *     - Removed the corresponding entries from auditDataIntegrity's
 *       counts and totalIssues.
 *     - Removed the corresponding entries from repairAllData's repairs
 *       map.
 *     - Removed the deprecated aliases findOrphanedCharacters /
 *       repairOrphanedCharacters, which pointed at the removed
 *       findBrokenParentReferences / repairBrokenParentReferences.
 *     - Removed the deprecated aliases findOrphanedPlaces /
 *       repairOrphanedPlaces, which were aliases for the still-live
 *       findBrokenPlaceHierarchy / repairBrokenPlaceHierarchy but had
 *       no callers in the tree. If a caller reappears, re-add them
 *       with a migration note.
 *     - Header PARENTAGE and FUTURE WORK sections added.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY VERIFICATION
    // =========================================================================

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

    function _requireDependencies() {
        var missing = _missingDependencies();
        if (missing.length > 0) {
            throw new Error(
                'integrity.js: missing required dependencies: ' + missing.join(', ')
            );
        }
    }

    function _hasId(id) {
        return typeof id === 'string' && id.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    // =========================================================================
    // 1. PLACE HIERARCHY
    // =========================================================================

    /**
     * Finds places with broken parent references or circular hierarchies.
     * PURE.
     *
     * For cycles, reports the specific edge that closes the cycle. Only
     * one finding is produced per cycle, so the repairer will detach
     * exactly one parent edge.
     *
     * @returns {Array<{
     *   place: Object,
     *   issue: 'Missing parent'|'Circular parent reference',
     *   refId: string
     * }>}
     */
    function findBrokenPlaceHierarchy() {
        _requireDependencies();
        var places = window.getPlaces();
        var broken = [];

        var placeById = new Map();
        for (var i = 0; i < places.length; i++) {
            if (places[i] && _hasId(places[i].id)) {
                placeById.set(places[i].id, places[i]);
            }
        }

        // Deduplicate cycle reports so the same cycle is not reported
        // once per participating place.
        var reportedCycle = new Set();

        for (var j = 0; j < places.length; j++) {
            var place = places[j];
            if (!place || !_hasId(place.id)) continue;

            // Broken parent (dangling)
            if (_hasId(place.parentId) && !window.getPlaceById(place.parentId)) {
                broken.push({
                    place: place,
                    issue: 'Missing parent',
                    refId: place.parentId
                });
                continue;
            }

            // Cycle detection via DFS up the parent chain.
            if (_hasId(place.parentId)) {
                var seen = new Set();
                seen.add(place.id);
                var current = place;
                while (current && _hasId(current.parentId)) {
                    var parentId = current.parentId;
                    if (seen.has(parentId)) {
                        // The edge current → parentId closes a cycle.
                        // Canonicalize the cycle so only one edge per
                        // cycle is reported.
                        var cycleKey = _canonicalCycleKey(place.id, current, parentId);
                        if (!reportedCycle.has(cycleKey)) {
                            reportedCycle.add(cycleKey);
                            broken.push({
                                place: current,
                                issue: 'Circular parent reference',
                                refId: parentId
                            });
                        }
                        break;
                    }
                    seen.add(parentId);
                    var next = placeById.get(parentId);
                    if (!next) break;
                    current = next;
                }
            }
        }
        return broken;
    }

    /**
     * Produces a canonical key for a cycle so it is reported exactly once
     * regardless of which participating place triggered the discovery.
     * @private
     */
    function _canonicalCycleKey(startId, closingPlace, closingParentId) {
        // The pair (closingPlace.id, closingParentId) uniquely identifies
        // the edge we will report. Different starting points that discover
        // the same cycle land on the same edge.
        return closingPlace.id + '->' + closingParentId;
    }

    /**
     * Repairs broken place hierarchy. Nulls the specific parent edge that
     * is either dangling or closes a cycle. Detaches exactly one edge per
     * finding.
     * Does NOT persist.
     *
     * @returns {number} number of individual reference mutations
     */
    function repairBrokenPlaceHierarchy() {
        _requireDependencies();
        var broken = findBrokenPlaceHierarchy();
        var repairs = 0;

        for (var i = 0; i < broken.length; i++) {
            var item = broken[i];
            if (item.place.parentId === item.refId) {
                item.place.parentId = null;
                repairs++;
            }
        }
        return repairs;
    }

    // =========================================================================
    // 2. RELATIONSHIPS
    // =========================================================================
    //
    // The canonical relationship shape is audited directly. If the data
    // model uses a different field (rel.partnerId, or a participants array),
    // it must be migrated to the canonical shape before integrity runs.
    // This module does NOT infer between historical representations.

    /**
     * Returns the partner ID for a relationship, using the canonical
     * field only. Returns null when the field is missing.
     * @private
     */
    function _relationshipPartnerId(rel) {
        if (!rel) return null;
        if (_hasId(rel.partnerId)) return rel.partnerId;
        return null;
    }

    /**
     * Finds relationships with missing partner references.
     * PURE.
     *
     * @returns {Array<{ character, relationship, index, refId }>}
     */
    function findBrokenRelationships() {
        _requireDependencies();
        var characters = window.getCharacters();
        var broken = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!Array.isArray(char.relationships)) continue;

            for (var j = 0; j < char.relationships.length; j++) {
                var rel = char.relationships[j];
                var partnerId = _relationshipPartnerId(rel);
                if (!_hasId(partnerId)) continue;
                if (!window.getCharacterById(partnerId)) {
                    broken.push({
                        character: char,
                        relationship: rel,
                        index: j,
                        refId: partnerId
                    });
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
     * @returns {number} number of individual record mutations
     */
    function repairBrokenRelationships() {
        _requireDependencies();
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
        _requireDependencies();
        var characters = window.getCharacters();
        var broken = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!Array.isArray(char.friends)) continue;
            for (var j = 0; j < char.friends.length; j++) {
                var friendId = char.friends[j];
                if (!_hasId(friendId)) continue;
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
        _requireDependencies();
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

    // =========================================================================
    // 3. HOUSEHOLD MEMBERS
    // =========================================================================

    /**
     * Finds broken household member and department head references.
     *
     * Only well-formed references (non-empty string IDs) are audited. An
     * entry without a characterId, or with a non-string characterId, is a
     * shape problem for validation.js — this finder does not classify it
     * as a dangling reference.
     *
     * PURE.
     */
    function findBrokenHouseholdMembers() {
        _requireDependencies();
        var households = window.getHouseholds();
        var broken = [];

        for (var i = 0; i < households.length; i++) {
            var household = households[i];

            if (Array.isArray(household.members)) {
                for (var j = 0; j < household.members.length; j++) {
                    var member = household.members[j];
                    if (!member || !_hasId(member.characterId)) continue;
                    if (!window.getCharacterById(member.characterId)) {
                        broken.push({
                            household: household,
                            member: member,
                            index: j,
                            issue: 'Missing member',
                            refId: member.characterId
                        });
                    }
                }
            }
            if (Array.isArray(household.departments)) {
                for (var k = 0; k < household.departments.length; k++) {
                    var dept = household.departments[k];
                    if (!dept || !_hasId(dept.headId)) continue;
                    if (!window.getCharacterById(dept.headId)) {
                        broken.push({
                            household: household,
                            department: dept,
                            departmentIndex: k,
                            issue: 'Missing department head',
                            refId: dept.headId
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
        _requireDependencies();
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
            } else if (item.issue === 'Missing department head') {
                if (item.department.headId === item.refId) {
                    item.department.headId = null;
                    repairs++;
                }
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

    // =========================================================================
    // 4. RANK & ROLE ASSIGNMENTS
    // =========================================================================

    /**
     * Finds broken rank assignments and invalid active ranks.
     * PURE.
     */
    function findBrokenRankAssignments() {
        _requireDependencies();
        var characters = window.getCharacters();
        var ranks = window.getRanks();
        var rankIds = new Set();
        for (var r = 0; r < ranks.length; r++) {
            if (ranks[r] && _hasId(ranks[r].id)) rankIds.add(ranks[r].id);
        }

        var broken = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];

            if (Array.isArray(char.rankAssignments)) {
                for (var j = 0; j < char.rankAssignments.length; j++) {
                    var assignment = char.rankAssignments[j];
                    if (!assignment || !_hasId(assignment.rankId)) continue;
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

            if (_hasId(char.activeRankId) && !rankIds.has(char.activeRankId)) {
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
        _requireDependencies();
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
     * PURE. Audits dangling references only. Malformed assignment shape is
     * validation.js's concern.
     */
    function findBrokenRoleAssignments() {
        _requireDependencies();
        var characters = window.getCharacters();
        var roles = window.getRoles();
        var roleIds = new Set();
        for (var r = 0; r < roles.length; r++) {
            if (roles[r] && _hasId(roles[r].id)) roleIds.add(roles[r].id);
        }

        var broken = [];
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!Array.isArray(char.professions)) continue;
            for (var j = 0; j < char.professions.length; j++) {
                var prof = char.professions[j];
                if (!prof || !_hasId(prof.id)) continue;
                if (!roleIds.has(prof.id)) {
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
        _requireDependencies();
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

    // =========================================================================
    // 5. APPRENTICESHIPS
    // =========================================================================

    /**
     * Finds broken apprenticeship references and contradictory references.
     * PURE.
     *
     * Categories:
     *   - dangling:      masterId or apprentice entry points to a missing
     *                    character
     *   - contradictory: two-sided apprenticeship records disagree
     */
    function findBrokenApprenticeships() {
        _requireDependencies();
        var characters = window.getCharacters();
        var broken = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];

            if (_hasId(char.masterId) && !window.getCharacterById(char.masterId)) {
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
                    if (!_hasId(apprenticeId)) continue;
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

    var _VALID_APPRENTICESHIP_POLICIES = ['report', 'trustMasterList', 'trustApprenticeId'];

    /**
     * Repairs broken apprenticeships.
     *
     * Dangling references are always removed.
     *
     * Contradictions are handled according to `conflictPolicy`:
     *   - 'report' (default): contradictions are returned to the caller
     *     unrepaired.
     *   - 'trustMasterList': master.apprentices lists are authoritative;
     *     each apprentice's masterId is rebuilt from them.
     *   - 'trustApprenticeId': apprentice.masterId is authoritative;
     *     each master's apprentices list is rebuilt from them.
     *
     * The trusting policies are GRAPH RECONCILIATION operations. They may
     * touch entries that were not individually flagged. This is deliberate:
     * reconciling one side of the apprenticeship graph requires updating
     * the other side to match, and per-finding patches can make the graph
     * worse (e.g. nulling an apprentice's masterId while both master lists
     * still contain that apprentice).
     *
     * @param {Object} [options]
     * @param {string} [options.conflictPolicy] - one of the three above
     * @returns {{ repairs: number, contradictions: Array }}
     * @throws {Error} for an invalid conflictPolicy
     */
    function repairBrokenApprenticeships(options) {
        if (_isMissing(options)) {
            options = {};
        } else if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('repairBrokenApprenticeships: options must be an object');
        }

        var policy = _isMissing(options.conflictPolicy) ? 'report' : options.conflictPolicy;
        if (_VALID_APPRENTICESHIP_POLICIES.indexOf(policy) === -1) {
            throw new Error(
                'repairBrokenApprenticeships: unknown conflictPolicy "' + policy + '". ' +
                'Expected one of: ' + _VALID_APPRENTICESHIP_POLICIES.join(', ')
            );
        }

        _requireDependencies();
        var broken = findBrokenApprenticeships();
        if (broken.length === 0) {
            return { repairs: 0, contradictions: [] };
        }

        var byChar = new Map();
        var repairs = 0;

        // Step 1: remove dangling references. Independent of policy.
        for (var i = 0; i < broken.length; i++) {
            var item = broken[i];

            if (item.issue === 'Missing master') {
                if (item.character.masterId === item.refId) {
                    item.character.masterId = null;
                    repairs++;
                }
            } else if (item.issue === 'Missing apprentice') {
                if (!byChar.has(item.character)) byChar.set(item.character, []);
                byChar.get(item.character).push(item.index);
            }
        }

        byChar.forEach(function(indices, character) {
            indices.sort(function(a, b) { return b - a; });
            for (var k = 0; k < indices.length; k++) {
                character.apprentices.splice(indices[k], 1);
                repairs++;
            }
        });

        // Step 2: apply reconciliation policy.
        var contradictions = [];

        if (policy === 'trustMasterList') {
            repairs += _reconcileByMasterList();
        } else if (policy === 'trustApprenticeId') {
            repairs += _reconcileByApprenticeId();
        } else {
            // 'report': collect contradictions without resolving.
            for (var j = 0; j < broken.length; j++) {
                if (broken[j].category === 'contradictory') {
                    contradictions.push(broken[j]);
                }
            }
        }

        return { repairs: repairs, contradictions: contradictions };
    }

    /**
     * Rebuilds each character's masterId from the union of master
     * .apprentices lists. If two masters both claim an apprentice, the
     * last one in iteration order wins (caller must resolve explicitly
     * if this is possible and meaningful in their data).
     * @private
     */
    function _reconcileByMasterList() {
        var characters = window.getCharacters();
        var authoritativeMasterId = new Map();

        for (var i = 0; i < characters.length; i++) {
            var master = characters[i];
            if (!Array.isArray(master.apprentices)) continue;
            for (var j = 0; j < master.apprentices.length; j++) {
                var apprenticeId = master.apprentices[j];
                if (!_hasId(apprenticeId)) continue;
                authoritativeMasterId.set(apprenticeId, master.id);
            }
        }

        var repairs = 0;
        for (var k = 0; k < characters.length; k++) {
            var char = characters[k];
            var expected = authoritativeMasterId.has(char.id)
                ? authoritativeMasterId.get(char.id)
                : null;
            if (char.masterId !== expected) {
                char.masterId = expected;
                repairs++;
            }
        }
        return repairs;
    }

    /**
     * Rebuilds each character's apprentices list from the union of
     * apprentice.masterId references.
     * @private
     */
    function _reconcileByApprenticeId() {
        var characters = window.getCharacters();
        var authoritativeApprentices = new Map();

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!_hasId(char.masterId)) continue;
            if (!authoritativeApprentices.has(char.masterId)) {
                authoritativeApprentices.set(char.masterId, []);
            }
            authoritativeApprentices.get(char.masterId).push(char.id);
        }

        var repairs = 0;
        for (var k = 0; k < characters.length; k++) {
            var master = characters[k];
            var expected = authoritativeApprentices.get(master.id) || [];
            if (!_arraysEqualAsSets(master.apprentices || [], expected)) {
                master.apprentices = expected.slice();
                repairs++;
            }
        }
        return repairs;
    }

    function _arraysEqualAsSets(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        var setA = new Set(a);
        for (var i = 0; i < b.length; i++) {
            if (!setA.has(b[i])) return false;
        }
        return true;
    }

    // =========================================================================
    // 6. COMPREHENSIVE AUDIT — PURE
    // =========================================================================

    /**
     * Runs all finders and returns a full report.
     * PURE. Does not mutate canonical data.
     *
     * Note: parentage on the character record is no longer audited here.
     * See PARENTAGE and FUTURE WORK in the module header.
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

        var brokenPlaces = findBrokenPlaceHierarchy();
        var brokenRelationships = findBrokenRelationships();
        var brokenFriendships = findBrokenFriendships();
        var brokenHouseholdMembers = findBrokenHouseholdMembers();
        var brokenRankAssignments = findBrokenRankAssignments();
        var brokenRoleAssignments = findBrokenRoleAssignments();
        var brokenApprenticeships = findBrokenApprenticeships();

        var total = brokenPlaces.length
            + brokenRelationships.length
            + brokenFriendships.length
            + brokenHouseholdMembers.length
            + brokenRankAssignments.length
            + brokenRoleAssignments.length
            + brokenApprenticeships.length;

        return {
            ok: true,
            counts: {
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

    // =========================================================================
    // 7. COMPREHENSIVE REPAIR
    // =========================================================================

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
        if (!before.ok) {
            throw new Error('integrity.js: pre-repair audit failed: ' + before.error);
        }

        var apprenticeshipResult = repairBrokenApprenticeships({
            conflictPolicy: options.conflictPolicy
        });

        var repairs = {
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

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    // Finders (pure)
    window.findBrokenPlaceHierarchy = findBrokenPlaceHierarchy;
    window.findBrokenRelationships = findBrokenRelationships;
    window.findBrokenFriendships = findBrokenFriendships;
    window.findBrokenHouseholdMembers = findBrokenHouseholdMembers;
    window.findBrokenRankAssignments = findBrokenRankAssignments;
    window.findBrokenRoleAssignments = findBrokenRoleAssignments;
    window.findBrokenApprenticeships = findBrokenApprenticeships;

    // Repairers (mutate memory; caller persists)
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

    // =========================================================================
    // 9. DEPRECATED ALIASES
    // =========================================================================
    //
    // The family parentage aliases (findOrphanedCharacters,
    // repairOrphanedCharacters) were removed together with the underlying
    // findBrokenParentReferences / repairBrokenParentReferences. See
    // PARENTAGE and FUTURE WORK in the module header.
    //
    // The place aliases (findOrphanedPlaces, repairOrphanedPlaces) were
    // also removed: no caller in the tree referenced them, and keeping
    // unused aliases invites accidental reintroduction of the deprecation.
    // If a caller reappears, re-add them with a migration note that names
    // the specific caller being unblocked.

    // =========================================================================
    // 10. REMOVED (moved elsewhere)
    // =========================================================================

    // - findBrokenParentReferences / repairBrokenParentReferences →
    //   removed. Parentage lives in parentChildEdges; the character-record
    //   fields they audited (motherId, fatherId, adoptedParents) were
    //   deleted from the schema. See PARENTAGE in the module header.
    // - findGenealogyCycles / repairGenealogyCycles → removed. Same reason:
    //   they walked removed character-record fields.
    // - requireIntegrityDependencies → private. Callers can preflight with
    //   auditDataIntegrity() which returns { ok: false, error } for the
    //   same condition.
    // - ensureDataIntegrity() → storage-schema.js
    // - autoAudit() / getTimeSinceLastAudit() → maintenance.js
    // - _invalidateCaches() → mutation boundary
    // - saveMasterData() → mutation boundary
    // - _showToast() → caller

})();
