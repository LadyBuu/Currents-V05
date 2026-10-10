/**
 * =============================================================================
 * STILL WATERS - RANK ISSUES (rank-issues.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-issues.js
 *
 * Detects rank configuration problems and produces auto-fix closures.
 *
 * This file:
 *   - scans the population for rank assignment inconsistencies
 *   - produces a structured list of issues, each carrying a fix closure
 *   - exposes an applyFixes() batch applier
 *   - exposes processAnnualRank(year) as the annual-pipeline entry point
 *   - exposes handleCharacterDeath() as the death-cascade hook
 *   - exposes removeAllReferencesTo() as the hard-delete cleanup
 *
 * This file does NOT:
 *   - persist (callers call RankCommands.persist)
 *   - toast or render
 *   - reach into character, family, or relationship state directly. All
 *     reads go through CharacterState projections, FamilyQueries, and
 *     RomanceQueries.
 *
 * ISSUE TYPES:
 *   Spouse Inheritance   — a character is married to a rank holder whose
 *                          rank grants spouse inheritance, and does not
 *                          hold the inherited rank.
 *   Child Inheritance    — a character's parent holds a rank whose
 *                          inheritance rules name a rank the child does
 *                          not hold.
 *   Gender Mismatch      — a character holds a rank restricted to the
 *                          opposite gender.
 *   Numbering Error      — a numbered rank's holder has an incorrect or
 *                          missing number.
 *   Deprecation Error    — a deceased character holds a rank that is
 *                          configured to deprecate on death.
 *   Broken Inheritance   — an inheritance rule references a rank that no
 *                          longer exists.
 *
 * Each issue carries:
 *   type           string
 *   severity       'error' | 'warning' | 'info'
 *   message        human-readable
 *   rankId         string | null
 *   rankName       string | null
 *   characterId    string | null
 *   characterName  string | null
 *   fixLabel       string | null
 *   fixData        object | null
 *   fix            function | null  -> { success, reason? }
 *
 * CONTRACT:
 *   - checkAll() never throws. It returns { success, issues, count,
 *     bySeverity }.
 *   - Each fix() returns { success: boolean, reason?: string }.
 *   - applyFixes(issues) applies every issue.fix() in order, returns
 *     { applied, failed, errors }.
 *   - processAnnualRank(year) checks, applies, renumbers, persists once.
 *   - handleCharacterDeath(id, options) deprecates deprecateOnDeath ranks
 *     and renumbers; does not persist.
 *   - removeAllReferencesTo(id) removes references to a deleted character
 *     from other characters' rank assignments; does not persist.
 *
 * DEPENDENCIES (REQUIRED):
 *   - rank-state.js         (RankState)
 *   - rank-rules.js         (RankRules)
 *   - rank-queries.js       (RankQueries)
 *   - rank-commands.js      (RankCommands)
 *   - rank-assignment.js    (RankAssignment) — for getNextRankNumber only
 *   - character-state.js    (CharacterState)
 *   - character-commands.js (CharacterCommands)
 *   - time.js               (getCurrentYear, calculateAge)
 *
 * DEPENDENCIES (REQUIRED AT CALL TIME):
 *   - RomanceQueries.getActiveCommittedPartners
 *   - FamilyQueries.getParents / getChildIds
 *
 * DEPENDENCIES (OPTIONAL):
 *   - registerLifecycleHook — if present, handleCharacterDeath and
 *     removeAllReferencesTo register death/delete handlers.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RankState) {
        throw new Error('rank-issues.js requires rank-state.js to load first.');
    }
    if (!window.RankRules) {
        throw new Error('rank-issues.js requires rank-rules.js to load first.');
    }
    if (!window.RankQueries) {
        throw new Error('rank-issues.js requires rank-queries.js to load first.');
    }
    if (!window.RankCommands) {
        throw new Error('rank-issues.js requires rank-commands.js to load first.');
    }
    if (!window.RankAssignment) {
        throw new Error('rank-issues.js requires rank-assignment.js to load first.');
    }
    if (!window.CharacterState) {
        throw new Error('rank-issues.js requires character-state.js to load first.');
    }
    if (!window.CharacterCommands) {
        throw new Error('rank-issues.js requires character-commands.js to load first.');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('rank-issues.js requires time.js (getCurrentYear).');
    }

    var RS = window.RankState;
    var RR = window.RankRules;
    var RQ = window.RankQueries;
    var RC = window.RankCommands;
    var RA = window.RankAssignment;
    var CS = window.CharacterState;
    var CC = window.CharacterCommands;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _readCharacter(characterId) {
        if (!_hasId(characterId)) return null;
        return CS.getCharacter(characterId);
    }

    function _readAllCharacters() {
        return CS.getAllCharacters();
    }

    function _displayName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        return (name + ' ' + surname).trim();
    }

    function _readRomanceQueries() {
        if (typeof window.RomanceQueries === 'undefined') return null;
        if (typeof window.RomanceQueries.getActiveCommittedPartners !== 'function') {
            return null;
        }
        return window.RomanceQueries;
    }

    function _readFamilyQueries() {
        if (typeof window.FamilyQueries === 'undefined') return null;
        return window.FamilyQueries;
    }

    function _getCommittedPartners(characterId) {
        var romance = _readRomanceQueries();
        if (!romance) return [];
        try {
            var partners = romance.getActiveCommittedPartners(characterId);
            if (!Array.isArray(partners)) return [];
            var out = [];
            for (var i = 0; i < partners.length; i++) {
                if (partners[i] && _hasId(partners[i].partnerId)) {
                    out.push(partners[i].partnerId);
                }
            }
            return out;
        } catch (e) {
            return [];
        }
    }

    function _getParentIds(characterId) {
        var family = _readFamilyQueries();
        if (!family || typeof family.getParents !== 'function') return [];
        try {
            var parents = family.getParents(characterId);
            if (!parents) return [];
            var ids = [];
            if (Array.isArray(parents)) {
                for (var i = 0; i < parents.length; i++) {
                    var p = parents[i];
                    if (!p) continue;
                    if (typeof p === 'string') ids.push(p);
                    else if (_hasId(p.id)) ids.push(p.id);
                    else if (_hasId(p.parentId)) ids.push(p.parentId);
                }
            } else if (_isPlainObject(parents)) {
                if (parents.father) {
                    var f = parents.father;
                    if (typeof f === 'string') ids.push(f);
                    else if (_hasId(f.id)) ids.push(f.id);
                    else if (_hasId(f.parentId)) ids.push(f.parentId);
                }
                if (parents.mother) {
                    var m = parents.mother;
                    if (typeof m === 'string') ids.push(m);
                    else if (_hasId(m.id)) ids.push(m.id);
                    else if (_hasId(m.parentId)) ids.push(m.parentId);
                }
            }
            return ids;
        } catch (e) {
            return [];
        }
    }

    function _getChildIds(characterId) {
        var family = _readFamilyQueries();
        if (!family) return [];
        var out = [];
        try {
            if (typeof family.getChildIds === 'function') {
                var ids = family.getChildIds(characterId);
                if (Array.isArray(ids)) {
                    for (var i = 0; i < ids.length; i++) {
                        if (_hasId(ids[i])) out.push(ids[i]);
                    }
                }
            } else if (typeof family.getChildren === 'function') {
                var children = family.getChildren(characterId);
                if (Array.isArray(children)) {
                    for (var j = 0; j < children.length; j++) {
                        var c = children[j];
                        if (!c) continue;
                        if (typeof c === 'string') out.push(c);
                        else if (_hasId(c.id)) out.push(c.id);
                        else if (_hasId(c.childId)) out.push(c.childId);
                    }
                }
            }
        } catch (e) {
            return out;
        }
        return out;
    }

    function _findAssignment(character, rankId, includeDeprecated) {
        if (!character || !Array.isArray(character.rankAssignments)) return null;
        for (var i = 0; i < character.rankAssignments.length; i++) {
            var a = character.rankAssignments[i];
            if (!a || a.rankId !== rankId) continue;
            if (includeDeprecated === true) return a;
            if (a.isDeprecated !== true) return a;
        }
        return null;
    }

    // =========================================================================
    // 3. RANK ISSUE STRUCTURE
    // =========================================================================

    function RankIssue(type, severity, message, rankId, characterId, fixFn, fixData) {
        this.type = type;
        this.severity = severity;
        this.message = message;
        this.rankId = rankId || null;
        this.characterId = characterId || null;
        this.fix = typeof fixFn === 'function' ? fixFn : null;
        this.fixData = fixData || null;
        this.fixLabel = null;
        this.rankName = null;
        this.characterName = null;

        if (_hasId(this.rankId)) {
            var rank = RS.getRank(this.rankId);
            if (rank && typeof rank.name === 'string') this.rankName = rank.name;
        }
        if (_hasId(this.characterId)) {
            var character = _readCharacter(this.characterId);
            if (character) this.characterName = _displayName(character);
        }
    }

    // =========================================================================
    // 4. MAIN CHECKER
    // =========================================================================

    function checkAll() {
        var issues = [];

        var groups = [
            _checkSpouseInheritance(),
            _checkChildInheritance(),
            _checkGenderMismatch(),
            _checkNumberingIssues(),
            _checkDeprecationIssues(),
            _checkBrokenInheritanceRules()
        ];

        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            if (!Array.isArray(g)) continue;
            for (var j = 0; j < g.length; j++) {
                issues.push(g[j]);
            }
        }

        var bySeverity = { error: [], warning: [], info: [] };
        for (var k = 0; k < issues.length; k++) {
            var iss = issues[k];
            if (bySeverity[iss.severity]) {
                bySeverity[iss.severity].push(iss);
            }
        }

        return {
            success: true,
            issues: issues,
            count: issues.length,
            bySeverity: bySeverity
        };
    }

    // =========================================================================
    // 5. SPOUSE INHERITANCE
    // =========================================================================

    function _checkSpouseInheritance() {
        var romance = _readRomanceQueries();
        if (!romance) return [];

        var allCharacters = _readAllCharacters();
        var rankCache = {};

        function getRank(rankId) {
            if (!_hasId(rankId)) return null;
            if (Object.prototype.hasOwnProperty.call(rankCache, rankId)) {
                return rankCache[rankId];
            }
            var r = RS.getRank(rankId);
            rankCache[rankId] = r;
            return r;
        }

        var issues = [];

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c) continue;
            if (c.isDeceased === true) continue;
            if (c.isDeleted === true) continue;

            var partners;
            try {
                partners = romance.getActiveCommittedPartners(c.id);
            } catch (e) {
                continue;
            }
            if (!Array.isArray(partners) || partners.length === 0) continue;

            for (var j = 0; j < partners.length; j++) {
                var pref = partners[j];
                if (!pref || !_hasId(pref.partnerId)) continue;

                var spouse = _readCharacter(pref.partnerId);
                if (!spouse) continue;
                if (!_hasId(spouse.activeRankId)) continue;

                var spouseRank = getRank(spouse.activeRankId);
                if (!spouseRank) continue;

                var inheritedRankId = _resolveSpouseInheritedRankId(spouseRank);
                if (!_hasId(inheritedRankId)) continue;

                var inheritedRank = getRank(inheritedRankId);
                if (!inheritedRank) continue;

                if (_findAssignment(c, inheritedRankId, false)) continue;

                // Gender restriction.
                if (inheritedRank.genderRestriction === 'male'
                    && c.gender !== 'male') continue;
                if (inheritedRank.genderRestriction === 'female'
                    && c.gender !== 'female') continue;

                var characterId = c.id;
                var rankId = inheritedRankId;
                var spouseId = spouse.id;
                var spouseName = _displayName(spouse);
                var sourceRankName = spouseRank.name;
                var inheritedRankName = inheritedRank.name;

                var fix = (function (cid, rid, sid, sName, srcName) {
                    return function () {
                        var result = RC.assignRankToCharacter(cid, rid, {
                            notes: 'Inherited from spouse ' + sName +
                                ' via ' + srcName,
                            assignedYear: window.getCurrentYear(),
                            inheritedFrom: sid
                        });
                        if (result.success) {
                            return { success: true };
                        }
                        return {
                            success: false,
                            reason: result.reason || 'assignRankToCharacter failed'
                        };
                    };
                })(characterId, rankId, spouseId, spouseName, sourceRankName);

                var issue = new RankIssue(
                    'Spouse Inheritance',
                    'error',
                    _displayName(c) + ' is married to ' + spouseName +
                    ' (who holds "' + sourceRankName +
                    '") but does not have the inherited rank "' +
                    inheritedRankName + '"',
                    rankId,
                    characterId,
                    fix,
                    { spouseId: spouseId, rankId: rankId }
                );
                issue.fixLabel = 'Add "' + inheritedRankName + '" to ' +
                    _displayName(c);
                issues.push(issue);
            }
        }

        return issues;
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

    // =========================================================================
    // 6. CHILD INHERITANCE
    // =========================================================================

    function _checkChildInheritance() {
        var family = _readFamilyQueries();
        if (!family) return [];

        var allCharacters = _readAllCharacters();
        var rankCache = {};

        function getRank(rankId) {
            if (!_hasId(rankId)) return null;
            if (Object.prototype.hasOwnProperty.call(rankCache, rankId)) {
                return rankCache[rankId];
            }
            var r = RS.getRank(rankId);
            rankCache[rankId] = r;
            return r;
        }

        var rulesCache = {};

        function getRules(rankId) {
            if (!_hasId(rankId)) return [];
            if (Object.prototype.hasOwnProperty.call(rulesCache, rankId)) {
                return rulesCache[rankId];
            }
            var rules = RQ.getInheritanceRulesForRank(rankId);
            rulesCache[rankId] = Array.isArray(rules) ? rules : [];
            return rulesCache[rankId];
        }

        var issues = [];

        for (var i = 0; i < allCharacters.length; i++) {
            var child = allCharacters[i];
            if (!child) continue;
            if (child.isDeceased === true) continue;
            if (child.isDeleted === true) continue;

            var parentIds = _getParentIds(child.id);
            for (var pi = 0; pi < parentIds.length; pi++) {
                var parentId = parentIds[pi];
                var parent = _readCharacter(parentId);
                if (!parent) continue;
                if (!_hasId(parent.activeRankId)) continue;

                var parentRank = getRank(parent.activeRankId);
                if (!parentRank) continue;

                var rules = getRules(parentRank.id);
                for (var ri = 0; ri < rules.length; ri++) {
                    var rule = rules[ri];
                    if (!rule) continue;

                    var childRankId = rule.childRankId;
                    if (rule.childRankIdFemale && child.gender === 'female') {
                        childRankId = rule.childRankIdFemale;
                    }
                    if (!_hasId(childRankId)) continue;

                    var childRank = getRank(childRankId);
                    if (!childRank) continue;

                    // Age floor.
                    if (typeof rule.minChildAge === 'number'
                        && rule.minChildAge > 0) {
                        var age = window.calculateAge(
                            child.birthYear,
                            child.isDeceased === true,
                            child.deathYear
                        );
                        if (typeof age !== 'number' || age < rule.minChildAge) {
                            continue;
                        }
                    }

                    if (_findAssignment(child, childRankId, false)) continue;

                    // Gender restriction on the inherited rank.
                    if (childRank.genderRestriction === 'male'
                        && child.gender !== 'male') continue;
                    if (childRank.genderRestriction === 'female'
                        && child.gender !== 'female') continue;

                    var childId = child.id;
                    var parentName = _displayName(parent);
                    var inheritedRankId = childRankId;
                    var inheritedRankName = childRank.name;
                    var sourceRankName = parentRank.name;

                    var fix = (function (cid, rid, pName, srcName) {
                        return function () {
                            var result = RC.assignRankToCharacter(cid, rid, {
                                notes: 'Inherited from parent ' + pName +
                                    ' via ' + srcName,
                                inheritedFrom: null
                            });
                            if (result.success) {
                                return { success: true };
                            }
                            return {
                                success: false,
                                reason: result.reason || 'assignRankToCharacter failed'
                            };
                        };
                    })(childId, inheritedRankId, parentName, sourceRankName);

                    var issue = new RankIssue(
                        'Child Inheritance',
                        'warning',
                        _displayName(child) + ' is a child of ' + parentName +
                        ' (who holds "' + sourceRankName +
                        '") but does not have the inherited rank "' +
                        inheritedRankName + '"',
                        inheritedRankId,
                        childId,
                        fix,
                        { parentId: parentId, rankId: inheritedRankId }
                    );
                    issue.fixLabel = 'Add "' + inheritedRankName + '" to ' +
                        _displayName(child);
                    issues.push(issue);
                }
            }
        }

        return issues;
    }

    // =========================================================================
    // 7. GENDER MISMATCH
    // =========================================================================

    function _checkGenderMismatch() {
        var allCharacters = _readAllCharacters();
        var issues = [];

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || !Array.isArray(c.rankAssignments)) continue;

            for (var j = 0; j < c.rankAssignments.length; j++) {
                var a = c.rankAssignments[j];
                if (!a || a.isDeprecated === true) continue;

                var rank = RS.getRank(a.rankId);
                if (!rank) continue;

                if (rank.genderRestriction === 'either') continue;
                if (rank.genderRestriction === c.gender) continue;

                var characterId = c.id;
                var rankId = rank.id;
                var rankName = rank.name;
                var characterName = _displayName(c);

                var fix = (function (cid, rid) {
                    return function () {
                        var result = RC.deprecateRankAssignment(cid, rid);
                        if (result.success) return { success: true };
                        return {
                            success: false,
                            reason: result.reason || 'deprecateRankAssignment failed'
                        };
                    };
                })(characterId, rankId);

                var issue = new RankIssue(
                    'Gender Mismatch',
                    'error',
                    characterName + ' holds "' + rankName + '" but is ' +
                    c.gender + ' (rank requires ' + rank.genderRestriction + ')',
                    rankId,
                    characterId,
                    fix,
                    { correctGender: rank.genderRestriction }
                );
                issue.fixLabel = 'Deprecate "' + rankName + '" from ' + characterName;
                issues.push(issue);
            }
        }

        return issues;
    }

    // =========================================================================
    // 8. NUMBERING ISSUES
    // =========================================================================
    //
    // Detects holders of a numbered rank whose number is either missing or
    // does not match what a renumber would assign.
    //
    // Rather than reproduce the renumber logic here, this check consults
    // RankAssignment.getNextRankNumber for each holder in each group, and
    // compares against the recorded number. A mismatch is a single issue per
    // (rank, holder) with a fix that calls RankCommands.renumberRankHolders.
    //
    // This produces at most one issue per rank in practice, since a
    // renumber fixes all holders of a rank. To keep the report compact, only
    // the first mismatch per rank is reported.

    function _checkNumberingIssues() {
        var allCharacters = _readAllCharacters();
        var issues = [];
        var seenRankIds = {};

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || !Array.isArray(c.rankAssignments)) continue;

            for (var j = 0; j < c.rankAssignments.length; j++) {
                var a = c.rankAssignments[j];
                if (!a || a.isDeprecated === true) continue;

                var rank = RS.getRank(a.rankId);
                if (!rank || rank.numbered !== true) continue;
                if (seenRankIds[rank.id]) continue;

                var discrepancy = _findFirstNumberingDiscrepancy(rank.id);
                if (!discrepancy) continue;
                seenRankIds[rank.id] = true;

                var rankId = rank.id;
                var rankName = rank.name;
                var characterName = discrepancy.characterName;

                var fix = (function (rid) {
                    return function () {
                        var result = RC.renumberRankHolders(rid);
                        if (result.success) {
                            return { success: true, fixedCount: result.fixedCount };
                        }
                        return {
                            success: false,
                            reason: result.reason || 'renumberRankHolders failed'
                        };
                    };
                })(rankId);

                var issue = new RankIssue(
                    'Numbering Error',
                    'error',
                    characterName + ' has number "' +
                    (discrepancy.currentDisplay || '(none)') +
                    '" for "' + rankName + '" but should be "' +
                    discrepancy.expectedDisplay + '"',
                    rankId,
                    discrepancy.characterId,
                    fix,
                    {
                        expectedNumber: discrepancy.expectedDisplay,
                        expectedRaw: discrepancy.expectedRaw
                    }
                );
                issue.fixLabel = 'Re-number all "' + rankName + '" holders';
                issues.push(issue);
            }
        }

        return issues;
    }

    /**
     * Finds the first (rank, holder) whose number is wrong. Returns null
     * when the rank's numbering is consistent.
     *
     * Walks the group structure the same way renumberRankHolders does, so
     * the expected number matches what the fix will produce.
     */
    function _findFirstNumberingDiscrepancy(rankId) {
        var rank = RS.getRank(rankId);
        if (!rank || rank.numbered !== true) return null;

        var allCharacters = _readAllCharacters();
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

        var found = null;

        groups.forEach(function (holders) {
            if (found) return;

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
                var expectedDisplay = RR.formatNumber(
                    expectedRaw,
                    rank.numberingType
                );

                var current = entry.assignment.number;
                var currentRaw = current && typeof current.rawNumber === 'number'
                    ? current.rawNumber
                    : null;
                var currentDisplay = current && typeof current.display === 'string'
                    ? current.display
                    : null;

                if (currentRaw === expectedRaw && currentDisplay === expectedDisplay) {
                    continue;
                }

                found = {
                    characterId: entry.character.id,
                    characterName: _displayName(entry.character),
                    currentRaw: currentRaw,
                    currentDisplay: currentDisplay,
                    expectedRaw: expectedRaw,
                    expectedDisplay: expectedDisplay
                };
                return;
            }
        });

        return found;
    }

    function _resolveHolderGroupKey(rank, character, assignment) {
        if (rank.numberingGroup === 'global') return 'global';

        if (_hasId(assignment.inheritedFrom)) {
            return assignment.inheritedFrom;
        }

        var sourceId = RQ.getInheritanceSource(character.id, rank.id);
        if (_hasId(sourceId)) return sourceId;
        return 'unknown';
    }

    // =========================================================================
    // 9. DEPRECATION ISSUES
    // =========================================================================

    function _checkDeprecationIssues() {
        var allCharacters = _readAllCharacters();
        var issues = [];
        var seenCharacterIds = {};

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c) continue;
            if (c.isDeceased !== true) continue;
            if (seenCharacterIds[c.id]) continue;
            if (!Array.isArray(c.rankAssignments)) continue;

            for (var j = 0; j < c.rankAssignments.length; j++) {
                var a = c.rankAssignments[j];
                if (!a || a.isDeprecated === true) continue;

                var rank = RS.getRank(a.rankId);
                if (!rank || rank.deprecateOnDeath !== true) continue;

                seenCharacterIds[c.id] = true;

                var characterId = c.id;
                var rankId = rank.id;
                var rankName = rank.name;
                var characterName = _displayName(c);

                var fix = (function (cid, rid) {
                    return function () {
                        var result = RC.deprecateRankAssignment(cid, rid);
                        if (result.success) return { success: true };
                        return {
                            success: false,
                            reason: result.reason || 'deprecateRankAssignment failed'
                        };
                    };
                })(characterId, rankId);

                var issue = new RankIssue(
                    'Deprecation Error',
                    'error',
                    characterName + ' has died but "' + rankName +
                    '" has not been deprecated (rank is set to deprecate on death)',
                    rankId,
                    characterId,
                    fix,
                    { shouldDeprecate: true }
                );
                issue.fixLabel = 'Deprecate "' + rankName + '" from ' + characterName;
                issues.push(issue);
                break;
            }
        }

        return issues;
    }

    // =========================================================================
    // 10. BROKEN INHERITANCE RULES
    // =========================================================================

    function _checkBrokenInheritanceRules() {
        var issues = [];
        var allRules = RQ.getInheritanceRules();
        var rankCache = {};

        function rankExists(rankId) {
            if (!_hasId(rankId)) return false;
            if (Object.prototype.hasOwnProperty.call(rankCache, rankId)) {
                return rankCache[rankId];
            }
            var r = RS.getRank(rankId);
            rankCache[rankId] = !!r;
            return rankCache[rankId];
        }

        for (var parentId in allRules) {
            if (!Object.prototype.hasOwnProperty.call(allRules, parentId)) continue;

            var parentRank = RS.getRank(parentId);
            if (!parentRank) {
                // Parent missing entirely. The rank record is gone but rules
                // persist. Report one issue per orphan parent; fix is not
                // automatic because we cannot tell whether to remove the
                // parent id or the rules.
                var orphanIssue = new RankIssue(
                    'Broken Inheritance Rule',
                    'error',
                    'Inheritance rules reference a non-existent parent rank (id: ' +
                    parentId + ')',
                    null,
                    null,
                    null,
                    null
                );
                orphanIssue.fixLabel = 'Manual fix required — remove broken rules';
                issues.push(orphanIssue);
                continue;
            }

            var rules = allRules[parentId];
            if (!Array.isArray(rules)) continue;

            var brokenIndices = [];
            for (var j = 0; j < rules.length; j++) {
                var rule = rules[j];
                if (!rule) continue;
                if (_hasId(rule.childRankId) && !rankExists(rule.childRankId)) {
                    brokenIndices.push(j);
                    continue;
                }
                if (_hasId(rule.childRankIdFemale)
                    && !rankExists(rule.childRankIdFemale)) {
                    brokenIndices.push(j);
                }
            }

            if (brokenIndices.length === 0) continue;

            var parentRankId = parentId;
            var parentRankName = parentRank.name;
            var indices = brokenIndices.slice();

            var fix = (function (pid, idxs) {
                return function () {
                    // Remove from the end so earlier indices stay valid.
                    idxs.sort(function (a, b) { return b - a; });
                    var removed = 0;
                    for (var i = 0; i < idxs.length; i++) {
                        var result = RC.removeInheritanceRule(pid, idxs[i]);
                        if (result.success) removed++;
                    }
                    if (removed === idxs.length) {
                        return { success: true, removed: removed };
                    }
                    return {
                        success: false,
                        reason: 'Removed ' + removed + ' of ' + idxs.length +
                            ' broken rules'
                    };
                };
            })(parentRankId, indices);

            var issue = new RankIssue(
                'Broken Inheritance Rule',
                'error',
                'Inheritance rule from "' + parentRankName + '" has ' +
                brokenIndices.length + ' broken child rank reference(s)',
                parentRankId,
                null,
                fix,
                { brokenIndices: brokenIndices }
            );
            issue.fixLabel = 'Remove broken rules from "' + parentRankName + '"';
            issues.push(issue);
        }

        return issues;
    }

    // =========================================================================
    // 11. BATCH FIX APPLIER
    // =========================================================================

    /**
     * Applies every issue.fix() in order.
     *
     * options:
     *   {
     *     filter  function(issue) -> boolean
     *             Only apply fixes where filter returns true. Default: all
     *             issues that have a fix.
     *   }
     *
     * Returns { applied, failed, skipped, errors }.
     *
     * Does NOT persist. Caller calls RankCommands.persist() after.
     */
    function applyFixes(issues, options) {
        options = options || {};
        var filter = typeof options.filter === 'function' ? options.filter : null;

        if (!Array.isArray(issues)) {
            return { applied: 0, failed: 0, skipped: 0, errors: [] };
        }

        var applied = 0;
        var failed = 0;
        var skipped = 0;
        var errors = [];

        for (var i = 0; i < issues.length; i++) {
            var issue = issues[i];
            if (!issue || typeof issue.fix !== 'function') {
                skipped++;
                continue;
            }
            if (filter && !filter(issue)) {
                skipped++;
                continue;
            }

            var result;
            try {
                result = issue.fix();
            } catch (e) {
                result = {
                    success: false,
                    reason: e && e.message ? e.message : 'fix threw'
                };
            }

            if (result && result.success === true) {
                applied++;
            } else {
                failed++;
                errors.push({
                    type: issue.type,
                    rankId: issue.rankId,
                    characterId: issue.characterId,
                    reason: result && result.reason
                        ? result.reason
                        : 'fix returned failure'
                });
            }
        }

        return {
            applied: applied,
            failed: failed,
            skipped: skipped,
            errors: errors
        };
    }

    // =========================================================================
    // 12. ANNUAL PIPELINE
    // =========================================================================

    /**
     * Runs the rank annual pipeline.
     *
     * Pipeline order:
     *   1. Detect issues (checkAll).
     *   2. Apply fixes for issues that have an automatic fix.
     *   3. Rebuild all numbering (catches anything step 2 missed).
     *   4. Persist once (unless persist: false).
     *
     * options:
     *   {
     *     persist:          boolean  default true
     *     skipFixes:        boolean  default false — if true, only report
     *     filter:           function(issue) -> boolean  — applied to fixes
     *   }
     *
     * Returns:
     *   {
     *     year,
     *     status:                 'completed' | 'completed_with_errors' | 'partial',
     *     issueCount,
     *     issuesBySeverity:       { error, warning, info },
     *     fixResults:             { applied, failed, skipped, errors },
     *     renumberResults:        { totalFixed, fixedCounts, errors },
     *     persisted:              boolean,
     *     persistError:           string | null
     *   }
     */
    function processAnnualRank(year, options) {
        options = options || {};
        var currentYear = (typeof year === 'number' && Number.isFinite(year))
            ? year
            : window.getCurrentYear();
        var shouldPersist = options.persist !== false;
        var skipFixes = options.skipFixes === true;

        var checkResult = checkAll();
        var issues = checkResult.issues;

        var fixResults = {
            applied: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        if (!skipFixes && issues.length > 0) {
            fixResults = applyFixes(issues, { filter: options.filter });
        }

        var renumberResults = RC.rebuildAllRankNumbering();

        var persisted = false;
        var persistError = null;
        if (shouldPersist) {
            var persistResult = RC.persist();
            if (persistResult.success) {
                persisted = true;
            } else {
                persistError = persistResult.reason;
            }
        }

        var status = 'completed';
        if (persistError) {
            status = 'partial';
        } else if (fixResults.failed > 0
            || (renumberResults.errors && renumberResults.errors.length > 0)) {
            status = 'completed_with_errors';
        }

        return {
            year: currentYear,
            status: status,
            issueCount: issues.length,
            issuesBySeverity: {
                error: checkResult.bySeverity.error.length,
                warning: checkResult.bySeverity.warning.length,
                info: checkResult.bySeverity.info.length
            },
            fixResults: fixResults,
            renumberResults: renumberResults,
            persisted: persisted,
            persistError: persistError
        };
    }

    // =========================================================================
    // 13. DEATH HOOK
    // =========================================================================

    /**
     * Handles a character death from the rank domain's perspective.
     *
     * Delegates the deprecate-on-death + renumber work to
     * RankCommands.deprecateRanksOnDeath. Does not persist — the death
     * cascade's orchestrator persists once at the end.
     *
     * options: { deathYear }
     */
    function handleCharacterDeath(characterId, options) {
        options = options || {};
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required' };
        }
        var deathYear = (typeof options.deathYear === 'number'
            && Number.isFinite(options.deathYear))
            ? options.deathYear
            : window.getCurrentYear();

        return RC.deprecateRanksOnDeath(characterId, { deathYear: deathYear });
    }

    // =========================================================================
    // 14. HARD-DELETE CLEANUP
    // =========================================================================

    /**
     * Removes every reference to a deleted character from other characters'
     * rank assignments.
     *
     * The character's own assignments vanish with the record. What remains
     * are inheritedFrom pointers on *other* characters' assignments that
     * named the deleted character. This function nulls them and renumbers
     * the affected ranks.
     *
     * Does NOT persist. Caller calls RankCommands.persist().
     */
    function removeAllReferencesTo(characterId) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required' };
        }

        var allCharacters = _readAllCharacters();
        var touchedRanks = {};
        var cleaned = 0;

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || c.id === characterId) continue;
            if (!Array.isArray(c.rankAssignments)) continue;

            for (var j = 0; j < c.rankAssignments.length; j++) {
                var a = c.rankAssignments[j];
                if (!a || a.isDeprecated === true) continue;
                if (a.inheritedFrom !== characterId) continue;

                var update = CC.updateRankAssignment(c.id, a.rankId, {
                    inheritedFrom: null
                });
                if (update && update.success === true) {
                    cleaned++;
                    touchedRanks[a.rankId] = true;
                }
            }
        }

        // Renumber affected ranks.
        var renumberErrors = [];
        for (var rankId in touchedRanks) {
            if (!Object.prototype.hasOwnProperty.call(touchedRanks, rankId)) continue;
            var rn = RC.renumberRankHolders(rankId);
            if (!rn.success && rn.reason) {
                renumberErrors.push({ rankId: rankId, reason: rn.reason });
            }
        }

        return {
            success: true,
            cleaned: cleaned,
            ranksRenumbered: Object.keys(touchedRanks).length,
            renumberErrors: renumberErrors
        };
    }

    // =========================================================================
    // 15. LIFECYCLE HOOK REGISTRATION
    // =========================================================================

    if (typeof window.registerLifecycleHook === 'function') {
        window.registerLifecycleHook('death', function (payload) {
            if (!payload || !_hasId(payload.characterId)) return;
            handleCharacterDeath(payload.characterId, {
                deathYear: (typeof payload.deathYear === 'number')
                    ? payload.deathYear
                    : undefined
            });
        });
        window.registerLifecycleHook('delete', function (payload) {
            if (!payload || !_hasId(payload.characterId)) return;
            removeAllReferencesTo(payload.characterId);
        });
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.RankIssues = {
        // Detection
        checkAll: checkAll,

        // Per-category checks (each returns an array of RankIssue)
        checkSpouseInheritance: _checkSpouseInheritance,
        checkChildInheritance: _checkChildInheritance,
        checkGenderMismatch: _checkGenderMismatch,
        checkNumberingIssues: _checkNumberingIssues,
        checkDeprecationIssues: _checkDeprecationIssues,
        checkBrokenInheritanceRules: _checkBrokenInheritanceRules,

        // Batch fix
        applyFixes: applyFixes,

        // Annual pipeline
        processAnnualRank: processAnnualRank,

        // Lifecycle
        handleCharacterDeath: handleCharacterDeath,
        removeAllReferencesTo: removeAllReferencesTo,

        // Structure
        RankIssue: RankIssue
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RankIssues;
    }
})();
