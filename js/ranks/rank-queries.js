/**
 * =============================================================================
 * STILL WATERS - RANK QUERIES (rank-queries.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-queries.js
 *
 * Read-only projections for the rank domain.
 *
 * This file:
 *   - projects ranks, inheritance rules, and level vocabulary for callers
 *   - scans characters for rank assignments, using the character projection
 *   - resolves who passed a rank down (inheritance source), using the family
 *     and relationship domains through their query APIs
 *   - computes per-rank holder statistics
 *   - exposes surname-rule and spouse-inheritance reads
 *   - provides the canonical normalisation of FamilyQueries parent/child
 *     results, shared with rank-assignment.js and rank-issues.js
 *
 * This file does NOT:
 *   - mutate state (goes through RankQueries -> RankState clones)
 *   - persist or notify
 *   - perform numbering arithmetic (rank-assignment.js)
 *   - enforce rank policy (rank-rules.js)
 *   - reach into character, family, or relationship state directly.
 *     Character reads go through CharacterState projections (via
 *     character.rankAssignments on the projection). Family reads go through
 *     FamilyQueries. Relationship reads go through RomanceQueries.
 *
 * CONTRACT:
 *   - Missing rank -> null. Missing collection -> [].
 *   - Year 0 is preserved. Priority 0 is preserved.
 *   - Singular lookups return a projection or null. Collections return an
 *     array. Command-shaped return values do not appear here.
 *   - Reads are reentrant. No _processing guard.
 *   - Invalid explicit input throws. Missing optional input returns empty.
 *
 * DEPENDENCIES (REQUIRED, load-time):
 *   - rank-state.js       (RankState)
 *   - rank-rules.js       (RankRules)
 *   - rank-constants.js   (RANK_LEVELS, AVAILABLE_SYMBOLS) — hard required
 *   - character-state.js  (CharacterState) — projection source
 *   - time.js             (getCurrentYear, calculateAge)
 *
 *   rank-constants.js was previously optional: getRankLevelName and
 *   getRankLevelDescription fell back to a hardcoded, abbreviated
 *   description table when RANK_LEVELS was absent. That fallback has
 *   been removed. Rank level names and descriptions are canonical data,
 *   not a query-side responsibility to reconstruct. A missing
 *   RANK_LEVELS is a load-order bug, not a runtime degradation case.
 *
 *   The load guard throws if RANK_LEVELS or AVAILABLE_SYMBOLS is
 *   missing. rank-bootstrap.js also verifies RANK_LEVELS as a required
 *   global (see the plan's Phase 9). Both checks together make a
 *   missing rank-constants.js loud at boot.
 *
 * DEPENDENCIES (REQUIRED AT CALL TIME, not at load):
 *   - RomanceQueries.getActiveCommittedPartners — for inheritance source
 *     resolution when the rank's inheritanceSource is 'spouse'
 *   - FamilyQueries.getParents — for inheritance source resolution when the
 *     rank's inheritanceSource is 'parent'; also used by getParentIds
 *   - FamilyQueries.getChildIds or getChildren — for getChildIds
 *
 *   These are checked at call time. If absent, the affected query
 *   returns null / [] / 'global' as documented per function. The rank
 *   catalogue itself (getRank, getAllRanks, etc.) does not depend on
 *   them and works even in a bare test harness.
 *
 * STRUCTURAL vs SEMANTIC READS:
 *   - Structural reads (who holds which rank, how many, per-gender counts,
 *     per-age-band counts) read only character projections and rank
 *     records. No cross-domain dependency.
 *   - Semantic reads (who passed this rank down) require RomanceQueries
 *     and/or FamilyQueries. Missing either is a legitimate "cannot
 *     resolve" state, not a fabrication case. Return null / [] rather
 *     than a made-up value.
 *
 * NORMALISATION SHARED WITH rank-assignment.js AND rank-issues.js:
 *   FamilyQueries.getParents may return any of:
 *     - { father: <ref>, mother: <ref> }    (object with two refs)
 *     - [<edge>, <edge>, ...]                (array of edges)
 *     - [<character>, <character>, ...]     (array of projections)
 *     - ['charId1', 'charId2', ...]         (array of strings)
 *
 *   Each ref may be:
 *     - a string id
 *     - { id, activeRankId }                (projection)
 *     - { parentId, parentType, ... }       (edge)
 *     - { id }                              (id-only shape)
 *
 *   _normaliseParentRef handles all of the above and is used by:
 *     - getInheritanceSource (in this file)
 *     - getParentIds (in this file, exported for reuse)
 *
 *   getChildIds (in this file, exported) normalises getChildIds /
 *   getChildren from FamilyQueries into a plain string[].
 *
 *   The three call sites (rank-queries, rank-assignment, rank-issues)
 *   previously had three slightly different inline normalisers. This
 *   file is the single source now.
 *
 * ICON POLICY: No emojis. Level icons come from icons.js via
 * window.getRankLevelIcon(priority). No inline Unicode level glyphs.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Previous revision:
 *     - Header STRUCTURAL vs SEMANTIC section added.
 *     - getRankLevelIcon documented as degrade-to-empty.
 *   Current revision (Phase 3):
 *     - rank-constants.js promoted to a hard load-time dependency.
 *       RANK_LEVELS missing throws at load; AVAILABLE_SYMBOLS missing
 *       throws at load.
 *     - _getRankLevels deleted. getRankLevelName and
 *       getRankLevelDescription read window.RANK_LEVELS directly.
 *       Missing keys still fall back to 'Level N' / 'Custom rank level'
 *       as before — that is a per-priority fallback, not a table
 *       reconstruction.
 *     - getParentIds(characterId) added. Single normaliser for
 *       FamilyQueries.getParents' multiple shapes. Exported so
 *       rank-assignment.js and rank-issues.js can delegate.
 *     - getChildIds(characterId) added. Wraps FamilyQueries.getChildIds
 *       / getChildren with the same normalisation. Exported for the
 *       same reason.
 *     - _normaliseParentRef documented as the internal single-source
 *       normaliser; still private, consumed by getParentIds and
 *       getInheritanceSource.
 *     - No public signature change, no public return-shape change for
 *       existing functions. Two new exports added.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RankState) {
        throw new Error('rank-queries.js requires rank-state.js to load first.');
    }
    if (!window.RankRules) {
        throw new Error('rank-queries.js requires rank-rules.js to load first.');
    }
    if (typeof window.RANK_LEVELS === 'undefined') {
        throw new Error(
            'rank-queries.js requires rank-constants.js (RANK_LEVELS missing).'
        );
    }
    if (!Array.isArray(window.AVAILABLE_SYMBOLS)) {
        throw new Error(
            'rank-queries.js requires rank-constants.js (AVAILABLE_SYMBOLS missing).'
        );
    }
    if (!window.CharacterState) {
        throw new Error('rank-queries.js requires character-state.js to load first.');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('rank-queries.js requires time.js (getCurrentYear).');
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error('rank-queries.js requires time.js (calculateAge).');
    }

    var RS = window.RankState;
    var RR = window.RankRules;
    var CS = window.CharacterState;

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _readCharacter(id) {
        if (!_hasId(id)) return null;
        return CS.getCharacter(id);
    }

    function _readAllCharacters() {
        return CS.getAllCharacters();
    }

    // =========================================================================
    // 3. RANK QUERIES (delegating to RankState)
    // =========================================================================

    function getRank(rankId) {
        return RS.getRank(rankId);
    }

    function getAllRanks() {
        return RS.getAllRanks();
    }

    function getRanksByPriority(priority) {
        return RS.getRanksByPriority(priority);
    }

    function getRankHierarchy() {
        return RS.getRankHierarchy();
    }

    function getRankCount() {
        return RS.getRankCount();
    }

    function getInheritanceRules() {
        return RS.getInheritanceRules();
    }

    function getInheritanceRulesForRank(rankId) {
        return RS.getInheritanceRulesForRank(rankId);
    }

    // =========================================================================
    // 4. LEVEL HELPERS
    // =========================================================================
    //
    // Level name and description come from RANK_LEVELS (rank-constants.js),
    // which is a hard load-time dependency. Level icon comes from icons.js
    // via window.getRankLevelIcon, which maps priority -> SVG. The two are
    // separate concerns: constants describe the level; icons supply the
    // visual.
    //
    // Per-priority fallbacks ('Level N', 'Custom rank level') are retained
    // for robustness against a RANK_LEVELS map that does not define every
    // priority 1..10. They are NOT a table reconstruction; the canonical
    // table is always window.RANK_LEVELS.

    function getRankLevelName(priority) {
        var level = window.RANK_LEVELS[priority];
        return level ? level.name : 'Level ' + priority;
    }

    function getRankLevelDescription(priority) {
        var level = window.RANK_LEVELS[priority];
        return level ? level.description : 'Custom rank level';
    }

    /**
     * Returns the SVG markup for a rank level icon.
     *
     * Delegates to window.getRankLevelIcon (icons.js). If icons.js is not
     * loaded, returns the empty string. Level icons are presentation; the
     * absence of icons.js is not a query failure.
     *
     * Note: rank-bootstrap.js treats getRankLevelIcon as a required global.
     * In production, this function always returns SVG markup. The
     * empty-string fallback exists for bare test harnesses that load only
     * the query layer.
     */
    function getRankLevelIcon(priority) {
        if (typeof window.getRankLevelIcon === 'function') {
            var icon = window.getRankLevelIcon(priority);
            return typeof icon === 'string' ? icon : '';
        }
        return '';
    }

    function getAvailableSymbols() {
        return window.AVAILABLE_SYMBOLS.slice();
    }

    // =========================================================================
    // 5. CHARACTER RANK QUERIES
    // =========================================================================
    //
    // Reads character.rankAssignments from the projection. Does not reach
    // into CharacterState._getLiveCharacterForMutation. The projection
    // provides a cloned array of assignment records with the shape authored
    // by CharacterCommands (rankId, customTitle, address, number, order,
    // isActive, isDeprecated, assignedYear, notes, inheritedFrom).

    function _characterHasRankAssignment(character, rankId, includeDeprecated) {
        if (!character || !Array.isArray(character.rankAssignments)) return false;
        for (var i = 0; i < character.rankAssignments.length; i++) {
            var a = character.rankAssignments[i];
            if (!a || a.rankId !== rankId) continue;
            if (includeDeprecated === true) return true;
            if (a.isDeprecated !== true) return true;
        }
        return false;
    }

    /**
     * Returns every character that holds the given rank.
     *
     * A character holds a rank if:
     *   - they have an active rank assignment for it (the default), OR
     *   - includeDeprecated is true and they have any assignment for it
     *     (including deprecated).
     *
     * Characters whose activeRankId matches rankId are always included,
     * because an active pointer implies a non-deprecated assignment.
     */
    function getCharactersWithRank(rankId, includeDeprecated) {
        if (!_hasId(rankId)) return [];
        includeDeprecated = includeDeprecated === true;

        var all = _readAllCharacters();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (c.isDeleted === true) continue;
            if (_characterHasRankAssignment(c, rankId, includeDeprecated)) {
                out.push(c);
                continue;
            }
            if (c.activeRankId === rankId) {
                out.push(c);
            }
        }
        return out;
    }

    function getRankHolderCount(rankId, includeDeprecated) {
        return getCharactersWithRank(rankId, includeDeprecated).length;
    }

    /**
     * Returns holder statistics for a rank.
     *
     * The counts are computed against the character projection. Age is
     * resolved via time.js calculateAge. Characters whose age cannot be
     * resolved (missing birthYear, missing deathYear for the deceased,
     * impossible chronology) are excluded from the age-band counts, but are
     * still counted in the total / gender / living-deceased buckets.
     */
    function getRankHolderStats(rankId) {
        var holders = getCharactersWithRank(rankId, false);

        var male = 0;
        var female = 0;
        var unknownGender = 0;
        var living = 0;
        var deceased = 0;
        var minors = 0;
        var adults = 0;
        var elders = 0;
        var unknownAge = 0;

        for (var i = 0; i < holders.length; i++) {
            var c = holders[i];

            if (c.gender === 'male') male++;
            else if (c.gender === 'female') female++;
            else unknownGender++;

            if (c.isDeceased === true) deceased++;
            else living++;

            var age = window.calculateAge(
                c.birthYear,
                c.isDeceased === true,
                c.deathYear
            );

            if (typeof age !== 'number' || !Number.isFinite(age)) {
                unknownAge++;
                continue;
            }
            if (age < 18) minors++;
            else if (age < 60) adults++;
            else elders++;
        }

        return {
            total: holders.length,
            male: male,
            female: female,
            unknownGender: unknownGender,
            living: living,
            deceased: deceased,
            minors: minors,
            adults: adults,
            elders: elders,
            unknownAge: unknownAge
        };
    }

    /**
     * Returns every rank assignment a character carries, non-deprecated
     * only unless includeDeprecated is set.
     *
     * The assignments are returned as clones of the projection's array,
     * sorted by order ascending (matches the character record's display
     * ordering contract).
     */
    function getRankAssignmentsForCharacter(characterId, includeDeprecated) {
        var character = _readCharacter(characterId);
        if (!character) return [];
        includeDeprecated = includeDeprecated === true;

        var source = Array.isArray(character.rankAssignments)
            ? character.rankAssignments
            : [];

        var out = [];
        for (var i = 0; i < source.length; i++) {
            var a = source[i];
            if (!a) continue;
            if (includeDeprecated !== true && a.isDeprecated === true) continue;
            out.push(a);
        }
        out.sort(function (a, b) {
            return (a.order || 0) - (b.order || 0);
        });
        return out;
    }

    /**
     * Returns the currently active rank assignment for a character, or null.
     * Reads the active pointer directly; falls back to scanning the
     * assignments array if the pointer is absent.
     */
    function getActiveRankAssignment(characterId) {
        var character = _readCharacter(characterId);
        if (!character) return null;

        if (_hasId(character.activeRankId)
            && Array.isArray(character.rankAssignments)) {
            for (var i = 0; i < character.rankAssignments.length; i++) {
                var a = character.rankAssignments[i];
                if (a && a.rankId === character.activeRankId
                    && a.isDeprecated !== true) {
                    return a;
                }
            }
        }

        if (Array.isArray(character.rankAssignments)) {
            for (var j = 0; j < character.rankAssignments.length; j++) {
                var b = character.rankAssignments[j];
                if (b && b.isActive === true && b.isDeprecated !== true) {
                    return b;
                }
            }
        }

        return null;
    }

    // =========================================================================
    // 6. SPOUSE INHERITANCE QUERIES
    // =========================================================================
    //
    // The spouse inherited rank is defined as: if a character's primary
    // committed partner holds a rank that grants spouse inheritance, the
    // character should hold the inherited rank. This query answers the
    // forward question: "what ranks is this character entitled to receive
    // by virtue of their spouse's rank?"
    //
    // Reads go through RomanceQueries. The relationship domain is the only
    // owner of "who is this character's committed partner."

    function _getRomanceQueries() {
        if (typeof window.RomanceQueries === 'undefined') {
            return null;
        }
        if (typeof window.RomanceQueries.getActiveCommittedPartners !== 'function') {
            return null;
        }
        return window.RomanceQueries;
    }

    /**
     * Returns the ranks this character is entitled to by spouse inheritance.
     *
     * Empty array if:
     *   - the character has no active committed partner
     *   - the partner holds no active rank
     *   - the partner's active rank grants no spouse inheritance
     *   - RomanceQueries is not loaded
     *
     * Returns an array of rank projections (from RankState).
     */
    function getSpouseInheritanceRanks(characterId) {
        if (!_hasId(characterId)) return [];

        var romance = _getRomanceQueries();
        if (!romance) return [];

        var partners;
        try {
            partners = romance.getActiveCommittedPartners(characterId);
        } catch (e) {
            return [];
        }
        if (!Array.isArray(partners) || partners.length === 0) return [];

        var seenRankIds = {};
        var out = [];

        for (var i = 0; i < partners.length; i++) {
            var partnerRef = partners[i];
            var partnerId = null;
            if (_isPlainObject(partnerRef) && _hasId(partnerRef.partnerId)) {
                partnerId = partnerRef.partnerId;
            }
            if (!partnerId) continue;

            var partner = _readCharacter(partnerId);
            if (!partner) continue;
            if (!_hasId(partner.activeRankId)) continue;

            var partnerRank = RS.getRank(partner.activeRankId);
            if (!partnerRank) continue;

            var inheritedRankId = _resolveSpouseInheritedRankId(partnerRank);
            if (!_hasId(inheritedRankId)) continue;
            if (seenRankIds[inheritedRankId]) continue;

            var inheritedRank = RS.getRank(inheritedRankId);
            if (!inheritedRank) continue;

            seenRankIds[inheritedRankId] = true;
            out.push(inheritedRank);
        }

        return out;
    }

    /**
     * Resolves which rank a holder of `rank` passes down via spouse
     * inheritance, or null.
     *
     * Precedence:
     *   1. sourceRankId with inheritanceSource === 'spouse'
     *   2. legacy spouseInheritance field
     *   3. nothing
     *
     * A rank whose inheritanceSource is 'parent' does not grant spouse
     * inheritance, even if sourceRankId is set.
     */
    function _resolveSpouseInheritedRankId(rank) {
        if (!_isPlainObject(rank)) return null;

        if (rank.inheritanceSource === 'spouse' && _hasId(rank.sourceRankId)) {
            return rank.sourceRankId;
        }
        if (_hasId(rank.spouseInheritance)) {
            return rank.spouseInheritance;
        }
        return null;
    }

    /**
     * Returns the ranks a character has *received* by spouse inheritance.
     *
     * Distinct from getSpouseInheritanceRanks: that function asks what a
     * character is entitled to based on their partner's rank. This function
     * answers what they actually hold where inheritedFrom is set.
     *
     * A rank assignment is considered spouse-inherited when its
     * inheritedFrom field is set and the source character is the current
     * committed partner. This tolerates the case where the source character
     * is no longer the partner (widow/widower) — the assignment remains,
     * marked as spouse-inherited historically.
     */
    function getReceivedSpouseInheritanceRanks(characterId) {
        var character = _readCharacter(characterId);
        if (!character) return [];
        if (!Array.isArray(character.rankAssignments)) return [];

        var out = [];
        for (var i = 0; i < character.rankAssignments.length; i++) {
            var a = character.rankAssignments[i];
            if (!a || a.isDeprecated === true) continue;
            if (!_hasId(a.inheritedFrom)) continue;

            var rank = RS.getRank(a.rankId);
            if (!rank) continue;
            if (rank.inheritanceSource !== 'spouse'
                && !_hasId(rank.spouseInheritance)) continue;

            out.push({
                rank: rank,
                assignment: a,
                inheritedFrom: a.inheritedFrom
            });
        }
        return out;
    }

    // =========================================================================
    // 7. INHERITANCE SOURCE
    // =========================================================================
    //
    // The single canonical implementation. Previously duplicated in
    // rank-assignment.js and rank-issues.js. Callers must use this one.
    //
    // Answers: "given a character and a rank they hold, who passed this
    // rank down?" Reads from the two relationship systems:
    //
    //   - parents:  FamilyQueries.getParents(childId)
    //   - spouses:  RomanceQueries.getActiveCommittedPartners(id)
    //
    // Returns the source character id, or null.

    function _getFamilyQueries() {
        if (typeof window.FamilyQueries === 'undefined') return null;
        return window.FamilyQueries;
    }

    /**
     * Normalises a parent reference returned by FamilyQueries.getParents.
     *
     * Accepts three shapes, because the family domain has had multiple
     * parent query surfaces:
     *
     *   1. Object with { id, activeRankId, ... }  — already a character
     *      projection.
     *   2. Object with { parentId, parentType, ... } — an edge record.
     *   3. String character id — bare id.
     *   4. Object with { id } only — id-only shape (defensive).
     *
     * Returns { id, activeRankId } or null.
     *
     * This is the internal normaliser. Callers should use getParentIds()
     * for "give me the parent ids" and getInheritanceSource() for
     * "who passed this rank down". _normaliseParentRef is not exported;
     * it is a shared internal primitive for those two.
     */
    function _normaliseParentRef(ref) {
        if (!ref) return null;

        if (typeof ref === 'string') {
            if (!_hasId(ref)) return null;
            var fromId = _readCharacter(ref);
            if (fromId) {
                return { id: fromId.id, activeRankId: fromId.activeRankId || null };
            }
            return { id: ref, activeRankId: null };
        }

        if (_isPlainObject(ref)) {
            if (_hasId(ref.id) && Object.prototype.hasOwnProperty.call(ref, 'activeRankId')) {
                return { id: ref.id, activeRankId: ref.activeRankId || null };
            }
            if (_hasId(ref.parentId)) {
                var parent = _readCharacter(ref.parentId);
                return {
                    id: ref.parentId,
                    activeRankId: parent ? (parent.activeRankId || null) : null
                };
            }
            if (_hasId(ref.id)) {
                var character = _readCharacter(ref.id);
                return {
                    id: ref.id,
                    activeRankId: character ? (character.activeRankId || null) : null
                };
            }
        }

        return null;
    }

    /**
     * Returns the parent character ids of a character, normalised across
     * FamilyQueries.getParents' multiple return shapes:
     *
     *   - { father: <ref>, mother: <ref> }    (object with two refs)
     *   - [<edge>, <edge>, ...]                (array of edges)
     *   - [<character>, <character>, ...]     (array of projections)
     *   - ['charId1', 'charId2', ...]         (array of strings)
     *
     * Each ref may be a string id, a projection with { id, activeRankId },
     * an edge with { parentId, parentType }, or an id-only object { id }.
     *
     * Shared with rank-assignment.js (for numbering group filtering) and
     * rank-issues.js (for child inheritance detection). Single
     * implementation to avoid drift.
     *
     * Returns [] when:
     *   - FamilyQueries is unavailable
     *   - the character has no parents
     *   - the character id is invalid
     *   - FamilyQueries.getParents throws
     *
     * Deduplicated. A parent appearing twice in the edge list appears once
     * in the result.
     *
     * @param {string} characterId
     * @returns {string[]}
     */
    function getParentIds(characterId) {
        if (!_hasId(characterId)) return [];
        var family = _getFamilyQueries();
        if (!family || typeof family.getParents !== 'function') return [];

        var parents;
        try {
            parents = family.getParents(characterId);
        } catch (e) {
            return [];
        }
        if (!parents) return [];

        var ids = [];
        var seen = {};

        function push(normalised) {
            if (!normalised || !_hasId(normalised.id)) return;
            if (seen[normalised.id]) return;
            seen[normalised.id] = true;
            ids.push(normalised.id);
        }

        if (Array.isArray(parents)) {
            for (var i = 0; i < parents.length; i++) {
                push(_normaliseParentRef(parents[i]));
            }
        } else if (_isPlainObject(parents)) {
            if (parents.father) push(_normaliseParentRef(parents.father));
            if (parents.mother) push(_normaliseParentRef(parents.mother));
        }
        return ids;
    }

    /**
     * Returns the child character ids of a character.
     *
     * Tries FamilyQueries.getChildIds first; falls back to
     * FamilyQueries.getChildren. Normalises the multiple return shapes
     * (array of ids, array of projections, array of edges).
     *
     * Shared with rank-issues.js (for child inheritance detection).
     *
     * Returns [] when:
     *   - FamilyQueries is unavailable
     *   - the character has no children
     *   - the character id is invalid
     *   - both getChildIds and getChildren throw
     *
     * @param {string} characterId
     * @returns {string[]}
     */
    function getChildIds(characterId) {
        if (!_hasId(characterId)) return [];
        var family = _getFamilyQueries();
        if (!family) return [];

        if (typeof family.getChildIds === 'function') {
            try {
                var ids = family.getChildIds(characterId);
                if (Array.isArray(ids)) {
                    var out = [];
                    var seen = {};
                    for (var i = 0; i < ids.length; i++) {
                        var id = ids[i];
                        if (!_hasId(id)) continue;
                        if (seen[id]) continue;
                        seen[id] = true;
                        out.push(id);
                    }
                    return out;
                }
            } catch (e) {
                // fall through to getChildren
            }
        }

        if (typeof family.getChildren === 'function') {
            try {
                var children = family.getChildren(characterId);
                if (!Array.isArray(children)) return [];
                var out2 = [];
                var seen2 = {};
                for (var j = 0; j < children.length; j++) {
                    var c = children[j];
                    if (!c) continue;
                    var cid = null;
                    if (typeof c === 'string' && c.length > 0) {
                        cid = c;
                    } else if (_hasId(c.id)) {
                        cid = c.id;
                    } else if (_hasId(c.childId)) {
                        cid = c.childId;
                    }
                    if (!cid) continue;
                    if (seen2[cid]) continue;
                    seen2[cid] = true;
                    out2.push(cid);
                }
                return out2;
            } catch (e2) {
                return [];
            }
        }
        return [];
    }

    /**
     * Resolves the source character for a rank assignment.
     *
     * @param {string} characterId
     * @param {string} rankId
     * @returns {string|null}
     */
    function getInheritanceSource(characterId, rankId) {
        if (!_hasId(characterId)) return null;
        if (!_hasId(rankId)) return null;

        var rank = RS.getRank(rankId);
        if (!rank) return null;

        // Spouse inheritance.
        if (rank.inheritanceSource === 'spouse' || _hasId(rank.spouseInheritance)) {
            var sourceRankId = rank.inheritanceSource === 'spouse'
                ? rank.sourceRankId
                : rank.spouseInheritance;

            if (_hasId(sourceRankId)) {
                var romance = _getRomanceQueries();
                if (romance) {
                    var partners;
                    try {
                        partners = romance.getActiveCommittedPartners(characterId);
                    } catch (e) {
                        partners = null;
                    }
                    if (Array.isArray(partners)) {
                        for (var i = 0; i < partners.length; i++) {
                            var pref = partners[i];
                            var partnerId = null;
                            if (_isPlainObject(pref) && _hasId(pref.partnerId)) {
                                partnerId = pref.partnerId;
                            }
                            if (!partnerId) continue;
                            var partner = _readCharacter(partnerId);
                            if (!partner) continue;
                            if (partner.activeRankId === sourceRankId) {
                                return partner.id;
                            }
                        }
                    }
                }
            }
        }

        // Parent inheritance.
        if (rank.inheritanceSource === 'parent' && _hasId(rank.sourceRankId)) {
            var family = _getFamilyQueries();
            if (!family || typeof family.getParents !== 'function') return null;

            var parents;
            try {
                parents = family.getParents(characterId);
            } catch (e) {
                return null;
            }
            if (!parents) return null;

            var candidates = [];
            if (Array.isArray(parents)) {
                candidates = parents.slice();
            } else if (_isPlainObject(parents)) {
                if (parents.father) candidates.push(parents.father);
                if (parents.mother) candidates.push(parents.mother);
            }

            for (var j = 0; j < candidates.length; j++) {
                var normalised = _normaliseParentRef(candidates[j]);
                if (!normalised) continue;
                if (normalised.activeRankId === rank.sourceRankId) {
                    return normalised.id;
                }
            }
        }

        return null;
    }

    // =========================================================================
    // 8. SURNAME RULE QUERIES
    // =========================================================================

    function getRanksWithSurnameRules() {
        var ranks = RS.getAllRanks();
        var out = [];
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].customSurnameRule === true) out.push(ranks[i]);
        }
        return out;
    }

    function getRankSurnameRule(rankId) {
        var rank = RS.getRank(rankId);
        if (!rank || rank.customSurnameRule !== true) return null;
        return {
            enabled: true,
            connector: typeof rank.surnameConnector === 'string'
                ? rank.surnameConnector
                : 'of',
            prefix: typeof rank.surnamePrefix === 'string'
                ? rank.surnamePrefix
                : '',
            suffix: typeof rank.surnameSuffix === 'string'
                ? rank.surnameSuffix
                : ''
        };
    }

    // =========================================================================
    // 9. VALIDATION HELPER
    // =========================================================================
    //
    // Thin delegation to RankRules.validate, kept here so that callers that
    // only import RankQueries have a validator available. Not a second
    // implementation: same policy, same authority.

    function isValidRank(rank) {
        var result = RR.validate(rank);
        return result.valid === true;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.RankQueries = {
        // Rank queries
        getRank: getRank,
        getAllRanks: getAllRanks,
        getRanksByPriority: getRanksByPriority,
        getRankHierarchy: getRankHierarchy,
        getRankCount: getRankCount,
        getInheritanceRules: getInheritanceRules,
        getInheritanceRulesForRank: getInheritanceRulesForRank,

        // Level helpers
        getRankLevelName: getRankLevelName,
        getRankLevelIcon: getRankLevelIcon,
        getRankLevelDescription: getRankLevelDescription,
        getAvailableSymbols: getAvailableSymbols,

        // Character rank queries
        getCharactersWithRank: getCharactersWithRank,
        getRankHolderCount: getRankHolderCount,
        getRankHolderStats: getRankHolderStats,
        getRankAssignmentsForCharacter: getRankAssignmentsForCharacter,
        getActiveRankAssignment: getActiveRankAssignment,

        // Spouse inheritance
        getSpouseInheritanceRanks: getSpouseInheritanceRanks,
        getReceivedSpouseInheritanceRanks: getReceivedSpouseInheritanceRanks,

        // Parent/child normalisation (shared with rank-assignment and
        // rank-issues). Single source for FamilyQueries' multiple shapes.
        getParentIds: getParentIds,
        getChildIds: getChildIds,

        // Inheritance source (canonical)
        getInheritanceSource: getInheritanceSource,

        // Surname rules
        getRanksWithSurnameRules: getRanksWithSurnameRules,
        getRankSurnameRule: getRankSurnameRule,

        // Validation
        isValidRank: isValidRank
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankQueries;
    }
})();
