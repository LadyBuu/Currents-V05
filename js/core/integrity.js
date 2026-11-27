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
 *   - auditDataIntegrity() is PURE. It runs find*() and returns a report.
 *   - repair*() functions mutate canonical data to fix detected issues.
 *   - repair*() functions do NOT persist. The orchestration layer decides
 *     whether to save.
 *   - repairAllData() performs repairs in memory only; the caller commits.
 *   - Missing dependencies throw. This module never silently no-ops.
 *
 * PARENTAGE:
 *   Parentage lives in FamilyState (parentChildEdges). The character
 *   record does NOT carry motherId, fatherId, children, adoptedParents,
 *   or adoptedChildren. This module does NOT audit parent references on
 *   the character record. Family edge integrity is owned by
 *   family-state.js + family-commands.js.
 *
 * RELATIONSHIP SCHEMA:
 *   This module audits the CANONICAL relationship shape:
 *   masterData.data.relationships. Each record has:
 *     id, type, status, participantA, participantB, startYear, endYear,
 *     attributes[], metadata{}, createdAt, updatedAt.
 *
 *   The legacy per-character slots (char.relationships, char.friends)
 *   are no longer canonical. The finders that audited them
 *   (findBrokenRelationships pre-fix, findBrokenFriendships pre-fix)
 *   have been rewritten to audit the canonical collection instead.
 *   Repairs go through RelationshipCommands.remove (the domain's
 *   mutation boundary) so the State indexes and dirty flag stay
 *   consistent.
 *
 * APPRENTICESHIP CONFLICT POLICIES:
 *   trustMasterList:  master.apprentices lists are authoritative;
 *                     rebuild each apprentice's masterId from them.
 *   trustApprenticeId: apprentice.masterId is authoritative;
 *                     rebuild each master's apprentices lists from them.
 *   report (default): detect contradictions, do not resolve them.
 *
 * FUTURE WORK (family integrity):
 *   Family edge integrity (dangling parentId, genealogy cycles across
 *   parentChildEdges) is NOT audited by this module. It belongs to the
 *   family domain.
 *
 * DEPENDENCIES (all REQUIRED):
 *   - accessors.js: getCharacters, getPlaces, getRanks, getRoles,
 *                   getHouseholds, getCharacterById, getPlaceById
 *
 * DEPENDENCIES (OPTIONAL, guarded at call time):
 *   - relationship-commands.js: RelationshipCommands.remove (used by
 *                               repairBrokenRelationships /
 *                               repairBrokenFriendships so repairs route
 *                               through the mutation boundary instead of
 *                               splicing masterData arrays directly)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - findBrokenRelationships / repairBrokenRelationships rewritten to
 *       audit masterData.data.relationships (the canonical collection)
 *       rather than char.relationships (legacy per-character slot).
 *       Dangling check is per participant: participantA and participantB
 *       are each verified against getCharacterById.
 *     - repairBrokenRelationships now routes removals through
 *       RelationshipCommands.remove when available, so the relationship
 *       State indexes (byId / byChar / byType / byPair) and the dirty
 *       flag stay consistent. Falls back to direct array splicing only
 *       when RelationshipCommands is absent (older builds / tests).
 *     - findBrokenFriendships / repairBrokenFriendships rewritten to
 *       audit masterData.data.relationships for type === 'friendship'
 *       with dangling participant ids. Previous implementation scanned
 *       char.friends (legacy slot) and found nothing on current data.
 *     - auditDataIntegrity counts updated: brokenRelationships now
 *       counts dangling-participant findings (one per dangling
 *       participant, so a record with both participants missing counts
 *       as 2). brokenFriendships counts the same way, restricted to
 *       type === 'friendship'.
 *     - repairAllData's repairs map keys unchanged; the underlying
 *       finders/repairers are the ones that moved to the canonical
 *       collection.
 *     - No change to place hierarchy, household members, rank
 *       assignments, role assignments, or apprenticeship auditing.
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

    /**
     * Returns the canonical relationship collection from masterData.
     * Defensive: returns [] when masterData is not loaded or the field
     * is not an array.
     * @private
     */
    function _getCanonicalRelationships() {
        if (!window.masterData
            || !window.masterData.data
            || !Array.isArray(window.masterData.data.relationships)) {
            return [];
        }
        return window.masterData.data.relationships;
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

        var reportedCycle = new Set();

        for (var j = 0; j < places.length; j++) {
            var place = places[j];
            if (!place || !_hasId(place.id)) continue;

            if (_hasId(place.parentId) && !window.getPlaceById(place.parentId)) {
                broken.push({
                    place: place,
                    issue: 'Missing parent',
                    refId: place.parentId
                });
                continue;
            }

            if (_hasId(place.parentId)) {
                var seen = new Set();
                seen.add(place.id);
                var current = place;
                while (current && _hasId(current.parentId)) {
                    var parentId = current.parentId;
                    if (seen.has(parentId)) {
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

    function _canonicalCycleKey(startId, closingPlace, closingParentId) {
        return closingPlace.id + '->' + closingParentId;
    }

    /**
     * Repairs broken place hierarchy. Nulls the specific parent edge that
     * is either dangling or closes a cycle. Detaches exactly one edge per
     * finding.
     * Does NOT persist.
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
    // 2. RELATIONSHIPS (canonical collection)
    // =========================================================================
    //
    // Audits masterData.data.relationships. Each record has participantA
    // and participantB; both must resolve via getCharacterById. A record
    // with both participants missing produces two findings (one per
    // dangling participant), because repairing either participant leaves
    // the record in a half-valid state that the caller may want to
    // surface separately.
    //
    // Repairs go through RelationshipCommands.remove when available, so
    // the State's byId / byChar / byType / byPair indexes and the
    // markDataDirty flag stay consistent with the canonical collection.

    /**
     * Finds relationships with missing participant references.
     * PURE.
     *
     * @returns {Array<{
     *   relationship: Object,
     *   participantRole: 'participantA'|'participantB',
     *   refId: string
     * }>}
     */
    function findBrokenRelationships() {
        _requireDependencies();
        var relationships = _getCanonicalRelationships();
        var broken = [];

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (!rel || typeof rel !== 'object') continue;

            if (_hasId(rel.participantA) && !window.getCharacterById(rel.participantA)) {
                broken.push({
                    relationship: rel,
                    participantRole: 'participantA',
                    refId: rel.participantA
                });
            }
            if (_hasId(rel.participantB) && !window.getCharacterById(rel.participantB)) {
                broken.push({
                    relationship: rel,
                    participantRole: 'participantB',
                    refId: rel.participantB
                });
            }
        }
        return broken;
    }

    /**
     * Repairs broken relationships by removing them.
     *
     * Preferred path: RelationshipCommands.remove(id) per distinct
     * relationship id. This keeps RelationshipState's indexes and the
     * dirty flag in sync with the canonical collection. If
     * RelationshipCommands is not loaded, falls back to direct array
     * splicing (used by tests and by older builds where State is not
     * the source of truth for the save envelope).
     *
     * Removals are deduplicated by relationship id, because a record
     * with both participants missing produces two findings but only
     * needs one removal.
     *
     * Does NOT persist.
     *
     * @returns {number} number of distinct relationship records removed
     */
    function repairBrokenRelationships() {
        _requireDependencies();
        var broken = findBrokenRelationships();
        if (broken.length === 0) return 0;

        // Deduplicate: one removal per distinct relationship id.
        var ids = [];
        var seen = new Set();
        for (var i = 0; i < broken.length; i++) {
            var relId = broken[i].relationship && broken[i].relationship.id;
            if (!_hasId(relId)) continue;
            if (seen.has(relId)) continue;
            seen.add(relId);
            ids.push(relId);
        }
        if (ids.length === 0) return 0;

        var repairs = 0;

        if (window.RelationshipCommands
            && typeof window.RelationshipCommands.remove === 'function') {
            for (var r = 0; r < ids.length; r++) {
                var res = window.RelationshipCommands.remove(ids[r]);
                if (res && res.success === true) repairs++;
            }
            return repairs;
        }

        // Fallback: direct array splice. Only safe when State is not the
        // canonical source (older builds, tests). Not recommended when
        // RelationshipState is loaded.
        var relationships = _getCanonicalRelationships();
        for (var s = relationships.length - 1; s >= 0; s--) {
            var rec = relationships[s];
            if (!rec || !_hasId(rec.id)) continue;
            if (seen.has(rec.id)) {
                relationships.splice(s, 1);
                repairs++;
            }
        }
        return repairs;
    }

    /**
     * Finds friendships (relationship records with type === 'friendship')
     * that have dangling participant references.
     *
     * This audits the canonical collection, not the legacy char.friends
     * slot. The legacy slot is no longer written.
     *
     * PURE.
     */
    function findBrokenFriendships() {
        _requireDependencies();
        var relationships = _getCanonicalRelationships();
        var broken = [];

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (!rel || typeof rel !== 'object') continue;
            if (rel.type !== 'friendship') continue;

            if (_hasId(rel.participantA) && !window.getCharacterById(rel.participantA)) {
                broken.push({
                    relationship: rel,
                    participantRole: 'participantA',
                    refId: rel.participantA
                });
            }
            if (_hasId(rel.participantB) && !window.getCharacterById(rel.participantB)) {
                broken.push({
                    relationship: rel,
                    participantRole: 'participantB',
                    refId: rel.participantB
                });
            }
        }
        return broken;
    }

    /**
     * Repairs broken friendships by removing them through the mutation
     * boundary, same as repairBrokenRelationships.
     * Does NOT persist.
     *
     * @returns {number} number of distinct friendship records removed
     */
    function repairBrokenFriendships() {
        _requireDependencies();
        var broken = findBrokenFriendships();
        if (broken.length === 0) return 0;

        var ids = [];
        var seen = new Set();
        for (var i = 0; i < broken.length; i++) {
            var relId = broken[i].relationship && broken[i].relationship.id;
            if (!_hasId(relId)) continue;
            if (seen.has(relId)) continue;
            seen.add(relId);
            ids.push(relId);
        }
        if (ids.length === 0) return 0;

        var repairs = 0;

        if (window.RelationshipCommands
            && typeof window.RelationshipCommands.remove === 'function') {
            for (var r = 0; r < ids.length; r++) {
                var res = window.RelationshipCommands.remove(ids[r]);
                if (res && res.success === true) repairs++;
            }
            return repairs;
        }

        var relationships = _getCanonicalRelationships();
        for (var s = relationships.length - 1; s >= 0; s--) {
            var rec = relationships[s];
            if (!rec || !_hasId(rec.id)) continue;
            if (rec.type !== 'friendship') continue;
            if (seen.has(rec.id)) {
                relationships.splice(s, 1);
                repairs++;
            }
        }
        return repairs;
    }

    // =========================================================================
    // 3. HOUSEHOLD MEMBERS
    // =========================================================================

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

        var contradictions = [];

        if (policy === 'trustMasterList') {
            repairs += _reconcileByMasterList();
        } else if (policy === 'trustApprenticeId') {
            repairs += _reconcileByApprenticeId();
        } else {
            for (var j = 0; j < broken.length; j++) {
                if (broken[j].category === 'contradictory') {
                    contradictions.push(broken[j]);
                }
            }
        }

        return { repairs: repairs, contradictions: contradictions };
    }

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
    // 5B. FAMILY EDGES (canonical parentChildEdges)
    // =========================================================================

    function findBrokenFamilyEdges() {
        _requireDependencies();
        var edges = window.FamilyState && typeof window.FamilyState.snapshot === 'function'
            ? window.FamilyState.snapshot()
            : (window.masterData && window.masterData.data
                && Array.isArray(window.masterData.data.parentChildEdges)
                ? window.masterData.data.parentChildEdges : []);
        var characters = window.getCharacters();
        var characterIds = new Set();
        for (var i = 0; i < characters.length; i++) {
            if (characters[i] && _hasId(characters[i].id)) characterIds.add(characters[i].id);
        }
        var broken = [];
        var graph = new Map();
        edges.forEach(function(edge) {
            if (!edge || typeof edge !== 'object') return;
            if (!_hasId(edge.parentId) || !characterIds.has(edge.parentId)) {
                broken.push({ edge: edge, issue: 'Missing parent', refId: edge.parentId || null });
            }
            if (!_hasId(edge.childId) || !characterIds.has(edge.childId)) {
                broken.push({ edge: edge, issue: 'Missing child', refId: edge.childId || null });
            }
            if (_hasId(edge.parentId) && _hasId(edge.childId)) {
                if (!graph.has(edge.parentId)) graph.set(edge.parentId, []);
                graph.get(edge.parentId).push(edge.childId);
            }
        });

        var color = new Map();
        var reported = new Set();
        function visit(id, stack) {
            color.set(id, 1);
            stack.push(id);
            (graph.get(id) || []).forEach(function(childId) {
                if (color.get(childId) === 1) {
                    var cycle = stack.slice(stack.indexOf(childId)).concat(childId);
                    var key = cycle.slice().sort().join('|');
                    if (!reported.has(key)) {
                        reported.add(key);
                        broken.push({ issue: 'Genealogy cycle', refId: childId, cycle: cycle });
                    }
                } else if (!color.get(childId)) {
                    visit(childId, stack);
                }
            });
            stack.pop();
            color.set(id, 2);
        }
        graph.forEach(function(_, id) {
            if (!color.get(id)) visit(id, []);
        });
        return broken;
    }

    // =========================================================================
    // 6. COMPREHENSIVE AUDIT — PURE
    // =========================================================================

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
        var brokenFamilyEdges = findBrokenFamilyEdges();

        var total = brokenPlaces.length
            + brokenRelationships.length
            + brokenFriendships.length
            + brokenHouseholdMembers.length
            + brokenRankAssignments.length
            + brokenRoleAssignments.length
            + brokenApprenticeships.length
            + brokenFamilyEdges.length;

        return {
            ok: true,
            counts: {
                brokenPlaceHierarchy: brokenPlaces.length,
                brokenRelationships: brokenRelationships.length,
                brokenFriendships: brokenFriendships.length,
                brokenHouseholdMembers: brokenHouseholdMembers.length,
                brokenRankAssignments: brokenRankAssignments.length,
                brokenRoleAssignments: brokenRoleAssignments.length,
                brokenApprenticeships: brokenApprenticeships.length,
                brokenFamilyEdges: brokenFamilyEdges.length
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
    window.findBrokenFamilyEdges = findBrokenFamilyEdges;

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

})();
