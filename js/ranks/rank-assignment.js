/**
 * =============================================================================
 * STILL WATERS - RANK ASSIGNMENT (rank-assignment.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-assignment.js
 *
 * Numbering arithmetic and inheritance-source resolution for the rank
 * domain.
 *
 * This file:
 *   - computes the next number for a rank assignment, given a rank and the
 *     character being assigned
 *   - renumbers holders of a numbered rank when their sequence changes
 *   - resolves the inheritance source of a rank assignment (delegating to
 *     RankQueries.getInheritanceSource, the canonical implementation)
 *   - scans the population for characters who should hold a rank by virtue
 *     of spouse inheritance but do not
 *   - generates a surname from a rank's surname rule
 *   - exposes getHolderGroupKey, the single implementation of the numbering
 *     group classification rule (shared with rank-issues.js)
 *
 * This file does NOT:
 *   - write to the character record (CharacterCommands owns that)
 *   - write to rank state (RankState is called by RankCommands)
 *   - persist or flush storage
 *   - read character.relationships directly (RomanceQueries is the sole
 *     owner of committed-partner facts)
 *   - read character.motherId / character.fatherId (FamilyQueries is the
 *     sole owner of parent facts)
 *   - format numbers (RankRules.formatNumber owns that)
 *   - decide whether an assignment is valid (RankRules.canAssignRank)
 *   - update a rank's surname rule (RankCommands.updateRankSurnameRule)
 *
 * OWNERSHIP:
 *   Rank assignment writes        -> RankCommands
 *   Character-record writes       -> CharacterCommands
 *   Numbering arithmetic          -> this file
 *   Numbering group classification -> this file (getHolderGroupKey)
 *   Number formatting             -> RankRules
 *   Parent/child id normalisation -> RankQueries.getParentIds / getChildIds
 *   Inheritance-source resolution -> RankQueries.getInheritanceSource
 *   Rank policy                   -> RankRules
 *   Rank state                    -> RankState (via RankCommands)
 *
 * CONTRACT:
 *   - Every function is synchronous. No _processing guard.
 *   - Missing input returns null / empty / { success: false, reason }.
 *     Invalid explicit input throws.
 *   - Randomness is never used.
 *   - No saveMasterData call. The caller persists once per batch via
 *     RankCommands.persist().
 *
 * LOAD ORDER:
 *   This file loads after rank-state.js, rank-rules.js, rank-queries.js,
 *   character-commands.js, and character-state.js. Rank-commands.js loads
 *   after this file. RomanceQueries and FamilyQueries are read at call
 *   time (see DEPENDENCIES below).
 *
 * DEPENDENCIES (REQUIRED, load-time):
 *   - rank-state.js         (RankState)
 *   - rank-rules.js         (RankRules)
 *   - rank-queries.js       (RankQueries) — canonical getInheritanceSource,
 *                            getParentIds, getChildIds
 *   - character-commands.js (CharacterCommands) — for updateRankAssignment
 *   - character-state.js    (CharacterState) — for projection reads
 *   - time.js               (getCurrentYear)
 *
 * DEPENDENCIES (REQUIRED AT CALL TIME):
 *   - RomanceQueries.getActiveCommittedPartners — for spouse inheritance
 *     scanning in checkAndFixSpouseInheritance
 *   - FamilyQueries.getParents — accessed via RankQueries.getParentIds;
 *     a missing FamilyQueries means getParentIds returns [] and the
 *     parent numbering group has no members (documented in
 *     rank-queries.js)
 *
 * SHARED HELPERS (exported to rank-issues.js):
 *   - getHolderGroupKey(rank, character, assignment) -> string
 *     The single implementation of the numbering group classification
 *     rule. rank-issues.js's numbering discrepancy detection delegates
 *     here so that "predict what renumber will produce" and "produce it"
 *     use the same rule.
 *
 *   - checkAndFixSpouseInheritance() -> { success, fixes, count }
 *     Returns fix data records shaped for
 *     RankCommands.applySpouseInheritanceFixes. See note below on the
 *     relationship to RankIssues.checkSpouseInheritance.
 *
 * RELATIONSHIP TO RankIssues.checkSpouseInheritance:
 *   Both functions scan the population for the same condition (a character
 *   is married to a rank holder whose rank grants spouse inheritance but
 *   does not hold the inherited rank). They return different shapes:
 *
 *     - RankAssignment.checkAndFixSpouseInheritance returns fix data
 *       records: { characterId, rankId, spouseId, spouseName, ... }.
 *       Consumed by RankCommands.applySpouseInheritanceFixes.
 *
 *     - RankIssues.checkSpouseInheritance returns RankIssue records
 *       carrying fix closures. Consumed by RankIssues.applyFixes.
 *
 *   The two scans are NOT consolidated in this revision. They are kept
 *   separate because:
 *
 *     1. RankCommands.applySpouseInheritanceFixes accepts the fix-data
 *        shape, not the RankIssue shape. Converting between them at the
 *        RankCommands boundary would require RankCommands to depend on
 *        RankIssues or on a shared shape module.
 *
 *     2. RankIssues' fix closure encapsulates additional per-issue
 *        context (severity, human-readable message, fixLabel) that the
 *        fix-data shape does not carry.
 *
 *   Future consolidation (making RankIssues consume
 *   RankAssignment.checkAndFixSpouseInheritance's output and wrap each
 *   record as a RankIssue) is a valid refactor but is out of scope for
 *   this phase. The plan's Phase 6 delegates other duplicated scans
 *   (_resolveHolderGroupKey, _getParentIds, _getChildIds) without touching
 *   this one, because this one has a semantic difference in return shape
 *   that the others do not.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Previous revision:
 *     - _getChildIds and updateRankSurnameRule removed (dead code / wrong
 *       owner).
 *     - RankAssignment._resolveHolderGroupKey and rank-issues.js's copy
 *       both exist; the plan flagged the duplication.
 *   Current revision (Phase 4):
 *     - getNextRankNumber signature reduced from 5 parameters to 3.
 *       characterName and gender were accepted but never read. Callers
 *       (rank-commands.js::assignRankToCharacter) updated to the new
 *       signature.
 *     - _getParentIds delegates to RankQueries.getParentIds. Inline
 *       normalisation (three shapes, two levels) deleted. Shared with
 *       rank-issues.js via the same export.
 *     - _resolveHolderGroupKey exported as RankAssignment.getHolderGroupKey.
 *       Single source for the numbering group classification rule.
 *     - checkAndFixSpouseInheritance docstring expanded to document its
 *       relationship with RankIssues.checkSpouseInheritance (kept separate,
 *       see RELATIONSHIP section).
 *     - Header DEPENDENCIES updated: rank-queries.js added to
 *       REQUIRED load-time dependencies (was runtime-only).
 *     - No public signature change for other functions, no public
 *       return-shape change.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RankState) {
        throw new Error('rank-assignment.js requires rank-state.js to load first.');
    }
    if (!window.RankRules) {
        throw new Error('rank-assignment.js requires rank-rules.js to load first.');
    }
    if (!window.RankQueries) {
        throw new Error('rank-assignment.js requires rank-queries.js to load first.');
    }
    if (!window.CharacterCommands) {
        throw new Error('rank-assignment.js requires character-commands.js to load first.');
    }
    if (!window.CharacterState) {
        throw new Error('rank-assignment.js requires character-state.js to load first.');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('rank-assignment.js requires time.js (getCurrentYear).');
    }

    var RS = window.RankState;
    var RR = window.RankRules;
    var RQ = window.RankQueries;
    var CC = window.CharacterCommands;
    var CS = window.CharacterState;

    if (typeof CC.updateRankAssignment !== 'function') {
        throw new Error(
            'rank-assignment.js: CharacterCommands.updateRankAssignment is required. ' +
            'Character-commands.js must be loaded with the rank API.'
        );
    }
    if (typeof RQ.getInheritanceSource !== 'function') {
        throw new Error(
            'rank-assignment.js: RankQueries.getInheritanceSource is required.'
        );
    }
    if (typeof RQ.getParentIds !== 'function') {
        throw new Error(
            'rank-assignment.js: RankQueries.getParentIds is required.'
        );
    }

    // =========================================================================
    // 2. HELPERS
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

    function _readCharacterProjection(characterId) {
        if (!_hasId(characterId)) return null;
        return CS.getCharacter(characterId);
    }

    function _readRomanceQueries() {
        if (typeof window.RomanceQueries === 'undefined') return null;
        if (typeof window.RomanceQueries.getActiveCommittedPartners !== 'function') {
            return null;
        }
        return window.RomanceQueries;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 3. GET NEXT RANK NUMBER
    // =========================================================================
    //
    // Produces the numbering info for a new assignment of `rank` to
    // `characterId`. The character must not already hold the rank.
    //
    // Returns null when the rank is not numbered. Returns an object shaped:
    //
    //   {
    //     rawNumber:      number,
    //     display:        string,
    //     type:           'ordinal' | 'roman',
    //     groupId:        string | null,
    //     holdersInGroup: number
    //   }
    //
    // The holdersInGroup count reflects the number of *other* holders in
    // the numbering group. The new assignment's rawNumber is that count + 1.
    //
    // The grouping rule:
    //   - 'global'   : all holders of the rank
    //   - 'parent'   : holders whose parent is the same source character
    //   - 'spouse'   : holders whose spouse is the same source character
    //   - 'source'   : holders inheriting from the same source character
    //
    // The classification is delegated to RankRules.classifyNumberingGroup.
    // The filter itself is _filterHoldersByGroup. Formatting is delegated
    // to RankRules.formatNumber.

    /**
     * @param {string} rankId
     * @param {string} characterId
     * @param {string|null} sourceCharacterId  inheritance source, or null
     * @returns {Object|null} NumberInfo or null
     */
    function getNextRankNumber(rankId, characterId, sourceCharacterId) {
        if (!_hasId(rankId)) return null;
        if (!_hasId(characterId)) return null;

        var rank = RS.getRank(rankId);
        if (!rank || rank.numbered !== true) return null;

        var allCharacters = CS.getAllCharacters();

        // Build the "current holders" list: characters other than the one
        // being assigned who already carry a non-deprecated assignment for
        // this rank.
        var holders = [];
        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || c.id === characterId) continue;
            if (!Array.isArray(c.rankAssignments)) continue;

            var assignment = null;
            for (var j = 0; j < c.rankAssignments.length; j++) {
                var a = c.rankAssignments[j];
                if (a && a.rankId === rankId && a.isDeprecated !== true) {
                    assignment = a;
                    break;
                }
            }
            if (!assignment) continue;

            holders.push({
                character: c,
                assignment: assignment
            });
        }

        // Apply grouping.
        var groupKey = RR.classifyNumberingGroup(rank, sourceCharacterId);
        var filtered = _filterHoldersByGroup(holders, rank, sourceCharacterId);

        // Sort.
        if (rank.numberingType === 'reign') {
            // Reign order: by assignment year ascending, then character name.
            filtered.sort(function (a, b) {
                var ay = a.assignment.assignedYear;
                var by = b.assignment.assignedYear;
                if (typeof ay !== 'number') ay = Number.MAX_SAFE_INTEGER;
                if (typeof by !== 'number') by = Number.MAX_SAFE_INTEGER;
                if (ay !== by) return ay - by;
                return String(a.character.name || '').localeCompare(
                    String(b.character.name || '')
                );
            });
        } else {
            // Ordinal order: by birth year ascending, then character name.
            filtered.sort(function (a, b) {
                var ay = a.character.birthYear;
                var by = b.character.birthYear;
                if (typeof ay !== 'number') ay = Number.MAX_SAFE_INTEGER;
                if (typeof by !== 'number') by = Number.MAX_SAFE_INTEGER;
                if (ay !== by) return ay - by;
                return String(a.character.name || '').localeCompare(
                    String(b.character.name || '')
                );
            });
        }

        var nextRaw = filtered.length + 1;
        var display = RR.formatNumber(nextRaw, rank.numberingType);
        var type = rank.numberingType === 'ordinal' ? 'ordinal' : 'roman';

        return {
            rawNumber: nextRaw,
            display: display,
            type: type,
            groupId: groupKey === 'global' ? null : groupKey,
            holdersInGroup: filtered.length
        };
    }

    function _filterHoldersByGroup(holders, rank, sourceCharacterId) {
        var group = rank.numberingGroup;

        if (group === 'global') return holders.slice();

        if (group === 'parent') {
            if (!_hasId(sourceCharacterId)) return [];
            return holders.filter(function (entry) {
                var parents = _getParentIds(entry.character.id);
                for (var i = 0; i < parents.length; i++) {
                    if (parents[i] === sourceCharacterId) return true;
                }
                return false;
            });
        }

        if (group === 'spouse') {
            if (!_hasId(sourceCharacterId)) return [];
            return holders.filter(function (entry) {
                var partnerIds = _getCommittedPartnerIds(entry.character.id);
                for (var i = 0; i < partnerIds.length; i++) {
                    if (partnerIds[i] === sourceCharacterId) return true;
                }
                return false;
            });
        }

        if (group === 'source') {
            if (!_hasId(sourceCharacterId)) return [];
            return holders.filter(function (entry) {
                if (_hasId(entry.assignment.inheritedFrom)) {
                    return entry.assignment.inheritedFrom === sourceCharacterId;
                }
                var resolved = RQ.getInheritanceSource(entry.character.id, rank.id);
                return resolved === sourceCharacterId;
            });
        }

        return holders.slice();
    }

    /**
     * Returns the parent character ids of a character. Delegates to
     * RankQueries.getParentIds, the canonical normaliser for
     * FamilyQueries' multiple parent shapes.
     *
     * The inline normalisation that used to live here has been removed.
     * rank-queries.js owns the single implementation; rank-assignment.js
     * and rank-issues.js both consume it.
     */
    function _getParentIds(characterId) {
        if (typeof RQ.getParentIds !== 'function') return [];
        return RQ.getParentIds(characterId);
    }

    function _getCommittedPartnerIds(characterId) {
        var romance = _readRomanceQueries();
        if (!romance) return [];

        var partners;
        try {
            partners = romance.getActiveCommittedPartners(characterId);
        } catch (e) {
            return [];
        }
        if (!Array.isArray(partners)) return [];

        var ids = [];
        for (var i = 0; i < partners.length; i++) {
            var p = partners[i];
            if (!p) continue;
            if (_hasId(p.partnerId)) ids.push(p.partnerId);
        }
        return ids;
    }

    // =========================================================================
    // 4. RENUMBER RANK HOLDERS
    // =========================================================================
    //
    // Recomputes the number for every non-deprecated holder of a numbered
    // rank, updating the character record via CharacterCommands only where
    // the number changed. Returns { success, fixedCount, errors }.
    //
    // Groups holders exactly as getNextRankNumber does, then walks each
    // group in order and assigns 1..N.

    function renumberRankHolders(rankId) {
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var rank = RS.getRank(rankId);
        if (!rank || rank.numbered !== true) {
            return _fail('Rank is not numbered.');
        }

        var allCharacters = CS.getAllCharacters();

        // Collect holders grouped by their numbering key.
        var groups = new Map();

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || !Array.isArray(c.rankAssignments)) continue;

            var assignment = null;
            for (var j = 0; j < c.rankAssignments.length; j++) {
                var a = c.rankAssignments[j];
                if (a && a.rankId === rankId && a.isDeprecated !== true) {
                    assignment = a;
                    break;
                }
            }
            if (!assignment) continue;

            var groupKey = _resolveHolderGroupKey(rank, c, assignment);
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push({
                character: c,
                assignment: assignment
            });
        }

        var fixedCount = 0;
        var errors = [];

        groups.forEach(function (holders, groupKey) {
            // Sort within the group.
            if (rank.numberingType === 'reign') {
                holders.sort(function (a, b) {
                    var ay = a.assignment.assignedYear;
                    var by = b.assignment.assignedYear;
                    if (typeof ay !== 'number') ay = Number.MAX_SAFE_INTEGER;
                    if (typeof by !== 'number') by = Number.MAX_SAFE_INTEGER;
                    if (ay !== by) return ay - by;
                    return String(a.character.name || '').localeCompare(
                        String(b.character.name || '')
                    );
                });
            } else {
                holders.sort(function (a, b) {
                    var ay = a.character.birthYear;
                    var by = b.character.birthYear;
                    if (typeof ay !== 'number') ay = Number.MAX_SAFE_INTEGER;
                    if (typeof by !== 'number') by = Number.MAX_SAFE_INTEGER;
                    if (ay !== by) return ay - by;
                    return String(a.character.name || '').localeCompare(
                        String(b.character.name || '')
                    );
                });
            }

            for (var k = 0; k < holders.length; k++) {
                var entry = holders[k];
                var expectedRaw = k + 1;
                var expectedDisplay = RR.formatNumber(expectedRaw, rank.numberingType);
                var expectedType = rank.numberingType === 'ordinal'
                    ? 'ordinal'
                    : 'roman';

                var currentNumber = entry.assignment.number;
                var currentDisplay = currentNumber && typeof currentNumber.display === 'string'
                    ? currentNumber.display
                    : null;
                var currentRaw = currentNumber && typeof currentNumber.rawNumber === 'number'
                    ? currentNumber.rawNumber
                    : null;

                if (currentRaw === expectedRaw && currentDisplay === expectedDisplay) {
                    continue;
                }

                var patch = {
                    number: {
                        rawNumber: expectedRaw,
                        display: expectedDisplay,
                        type: expectedType,
                        groupId: groupKey === 'global' ? null : groupKey,
                        holdersInGroup: holders.length
                    }
                };

                var result = CC.updateRankAssignment(entry.character.id, rankId, patch);
                if (result && result.success === true) {
                    fixedCount++;
                } else {
                    errors.push({
                        characterId: entry.character.id,
                        reason: result && result.reason
                            ? result.reason
                            : 'CharacterCommands refused the update.'
                    });
                }
            }
        });

        return _ok({
            rankId: rankId,
            fixedCount: fixedCount,
            errors: errors
        });
    }

    /**
     * Determines the numbering group key for an existing holder.
     *
     * For 'global' or unnumbered ranks, returns 'global'.
     * For grouped ranks, returns the source character id (or 'unknown' if
     * the source cannot be resolved — that bucket is still numbered,
     * separately from the resolved ones).
     *
     * EXPORTED as RankAssignment.getHolderGroupKey. Shared with
     * rank-issues.js's numbering discrepancy detection: both must use the
     * same grouping rule, or the fixer produces a different grouping than
     * the detector reports.
     *
     * Group key precedence:
     *   1. assignment.inheritedFrom — what the assignment was created with.
     *      This may differ from what getInheritanceSource would resolve
     *      today (e.g. widow/widower cases), and the historical grouping
     *      is what we want for stability.
     *   2. RQ.getInheritanceSource(character.id, rank.id) — resolves from
     *      current state.
     *   3. 'unknown' — a stable bucket for unresolvable sources.
     *
     * @param {Object} rank
     * @param {Object} character
     * @param {Object} assignment
     * @returns {string}
     */
    function _resolveHolderGroupKey(rank, character, assignment) {
        if (rank.numberingGroup === 'global') return 'global';

        // Prefer the recorded inheritedFrom: it reflects what the assignment
        // was created with, which may differ from what getInheritanceSource
        // would resolve today (widow/widower cases).
        if (_hasId(assignment.inheritedFrom)) {
            return assignment.inheritedFrom;
        }

        var sourceId = RQ.getInheritanceSource(character.id, rank.id);
        if (_hasId(sourceId)) return sourceId;
        return 'unknown';
    }

    // =========================================================================
    // 5. FIX ALL NUMBERING FOR CHARACTER
    // =========================================================================
    //
    // Convenience: for each numbered rank the character holds, renumber the
    // whole rank. Useful after a single character's assignment has changed
    // and the caller wants the affected ranks repaired.

    function fixAllNumberingForCharacter(characterId) {
        if (!_hasId(characterId)) return _fail('characterId is required.');

        var character = _readCharacterProjection(characterId);
        if (!character) return _fail('Character not found.');

        if (!Array.isArray(character.rankAssignments)) {
            return _ok({ fixedCount: 0, ranksProcessed: 0, errors: [] });
        }

        var seenRankIds = {};
        var fixedCount = 0;
        var ranksProcessed = 0;
        var errors = [];

        for (var i = 0; i < character.rankAssignments.length; i++) {
            var a = character.rankAssignments[i];
            if (!a || a.isDeprecated === true) continue;
            if (seenRankIds[a.rankId]) continue;
            seenRankIds[a.rankId] = true;

            var rank = RS.getRank(a.rankId);
            if (!rank || rank.numbered !== true) continue;

            ranksProcessed++;
            var result = renumberRankHolders(a.rankId);
            if (result.success) {
                fixedCount += result.fixedCount || 0;
                if (result.errors && result.errors.length > 0) {
                    for (var e = 0; e < result.errors.length; e++) {
                        errors.push(result.errors[e]);
                    }
                }
            } else {
                errors.push({ rankId: a.rankId, reason: result.reason });
            }
        }

        return _ok({
            fixedCount: fixedCount,
            ranksProcessed: ranksProcessed,
            errors: errors
        });
    }

    // =========================================================================
    // 6. SURNAME RULE
    // =========================================================================
    //
    // Generates a surname string from a rank's surname rule, using a
    // caller-supplied location name as the base.
    //
    // rule shape: { connector, prefix, suffix } as produced by
    // RankQueries.getRankSurnameRule.
    //
    // The output is the location name with connector/prefix/suffix applied,
    // then capitalised.

    function generateSurnameFromRankRule(character, context) {
        if (!_isPlainObject(character)) return null;
        if (!_hasId(character.activeRankId)) return null;

        var rank = RS.getRank(character.activeRankId);
        if (!rank || rank.customSurnameRule !== true) return null;

        var locationName = context && typeof context.locationName === 'string'
            ? context.locationName.trim()
            : '';
        if (!locationName) return null;

        var connector = typeof rank.surnameConnector === 'string'
            ? rank.surnameConnector
            : 'of';
        var prefix = typeof rank.surnamePrefix === 'string'
            ? rank.surnamePrefix
            : '';
        var suffix = typeof rank.surnameSuffix === 'string'
            ? rank.surnameSuffix
            : '';

        var result = locationName;

        if (connector && connector !== 'none') {
            result = connector + ' ' + result;
        }
        if (prefix) {
            result = prefix + result;
        }
        if (suffix) {
            result = result + suffix;
        }

        result = _capitaliseFirstLetter(result);
        return result;
    }

    function _capitaliseFirstLetter(str) {
        if (typeof str !== 'string' || str.length === 0) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // =========================================================================
    // 7. SPOUSE INHERITANCE DETECTION
    // =========================================================================
    //
    // Scans the population for characters who should hold a rank by virtue
    // of spouse inheritance but do not. Returns a list of proposed fixes
    // that a caller can apply via RankCommands.applySpouseInheritanceFixes.
    //
    // This function does NOT write. It builds the fix list. The caller
    // decides whether to apply.
    //
    // Reads committed partners via RomanceQueries. Never reads
    // character.relationships.
    //
    // RELATIONSHIP TO RankIssues.checkSpouseInheritance:
    //   Both scan for the same condition. They return different shapes
    //   (fix data vs RankIssue with fix closure). The two are NOT
    //   consolidated in this revision. See the header's RELATIONSHIP
    //   section for the rationale.

    function checkAndFixSpouseInheritance() {
        var romance = _readRomanceQueries();
        if (!romance) {
            return _fail('RomanceQueries.getActiveCommittedPartners is required.');
        }

        var allCharacters = CS.getAllCharacters();
        var rankCache = {};

        function getRank(rankId) {
            if (!_hasId(rankId)) return null;
            if (rankCache[rankId] !== undefined) return rankCache[rankId];
            var r = RS.getRank(rankId);
            rankCache[rankId] = r;
            return r;
        }

        var fixes = [];

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c) continue;
            if (c.isDeceased === true) continue;
            if (c.isDeleted === true) continue;

            var partners;
            try {
                partners = romance.getActiveCommittedPartners(c.id);
            } catch (e) {
                partners = null;
            }
            if (!Array.isArray(partners) || partners.length === 0) continue;

            for (var j = 0; j < partners.length; j++) {
                var pref = partners[j];
                if (!pref || !_hasId(pref.partnerId)) continue;

                var spouse = _readCharacterProjection(pref.partnerId);
                if (!spouse) continue;
                if (!_hasId(spouse.activeRankId)) continue;

                var spouseRank = getRank(spouse.activeRankId);
                if (!spouseRank) continue;

                var inheritedRankId = _resolveSpouseInheritedRankId(spouseRank);
                if (!_hasId(inheritedRankId)) continue;

                var inheritedRank = getRank(inheritedRankId);
                if (!inheritedRank) continue;

                // Already has it?
                var hasIt = false;
                if (Array.isArray(c.rankAssignments)) {
                    for (var k = 0; k < c.rankAssignments.length; k++) {
                        var a = c.rankAssignments[k];
                        if (a && a.rankId === inheritedRankId
                            && a.isDeprecated !== true) {
                            hasIt = true;
                            break;
                        }
                    }
                }
                if (hasIt) continue;

                // Gender restriction on the inherited rank.
                if (inheritedRank.genderRestriction === 'male'
                    && c.gender !== 'male') continue;
                if (inheritedRank.genderRestriction === 'female'
                    && c.gender !== 'female') continue;

                fixes.push({
                    characterId: c.id,
                    characterName: _displayName(c),
                    rankId: inheritedRankId,
                    rankName: inheritedRank.name,
                    spouseId: spouse.id,
                    spouseName: _displayName(spouse),
                    sourceRankId: spouseRank.id,
                    sourceRankName: spouseRank.name
                });
            }
        }

        return _ok({
            fixes: fixes,
            count: fixes.length
        });
    }

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

    function _displayName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        return (name + ' ' + surname).trim();
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RankAssignment = {
        // Numbering
        getNextRankNumber: getNextRankNumber,
        renumberRankHolders: renumberRankHolders,
        fixAllNumberingForCharacter: fixAllNumberingForCharacter,

        // Numbering group classification (shared with rank-issues.js)
        getHolderGroupKey: _resolveHolderGroupKey,

        // Surname rule
        generateSurnameFromRankRule: generateSurnameFromRankRule,

        // Spouse inheritance
        checkAndFixSpouseInheritance: checkAndFixSpouseInheritance

        // Removed:
        //   _getChildIds                -> dead code, never called
        //   updateRankSurnameRule       -> use RankCommands.updateRankSurnameRule
        //
        // The following were removed in an earlier pass:
        //   assignRankToCharacter       -> RankCommands.assignRankToCharacter
        //   deprecateRankAssignment     -> RankCommands.deprecateRankAssignment
        //   applySpouseInheritanceFixes -> RankCommands.applySpouseInheritanceFixes
        //   getInheritanceSource        -> RankQueries.getInheritanceSource
        //   toOrdinal                   -> RankRules.formatNumber
        //   toRoman                     -> RankRules.formatNumber
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankAssignment;
    }
})();
