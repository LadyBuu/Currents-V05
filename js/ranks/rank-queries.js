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
 * DEPENDENCIES (REQUIRED):
 *   - rank-state.js       (RankState)
 *   - rank-rules.js       (RankRules)
 *   - character-state.js  (CharacterState) — projection source
 *   - character-queries.js (CharacterQueries) — for age reads via calculateAge
 *   - time.js             (getCurrentYear, calculateAge)
 *
 * DEPENDENCIES (REQUIRED AT CALL TIME, not at load):
 *   - RomanceQueries.getActiveCommittedPartners — for inheritance source
 *     resolution when the rank's inheritanceSource is 'spouse'
 *   - FamilyQueries.getParents — for inheritance source resolution when the
 *     rank's inheritanceSource is 'parent'
 *
 * DEPENDENCIES (OPTIONAL, used only if present):
 *   - RelationshipQueries.getById — for deep inheritance source reads
 *     (only when a rank's source is a specific rank id, not a rank type)
 *
 * ICON POLICY: No emojis. Level icons come from icons.js via
 * window.getRankLevelIcon(priority). No inline Unicode level glyphs.
 *
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
    // Level name and description come from RANK_LEVELS (constants).
    // Level icon comes from icons.js via window.getRankLevelIcon, which
    // maps priority -> SVG icon. The two are separate concerns: constants
    // describe the level; icons supply the visual.

    function _getRankLevels() {
        return window.RANK_LEVELS || {
            1: { name: 'Sovereign', description: 'Highest level' },
            2: { name: 'High Noble', description: 'Dukes, princes' },
            3: { name: 'Noble', description: 'Counts, earls' },
            4: { name: 'Gentry', description: 'Knights' },
            5: { name: 'Commoner', description: 'Common people' }
        };
    }

    function getRankLevelName(priority) {
        var levels = _getRankLevels();
        var level = levels[priority];
        return level ? level.name : 'Level ' + priority;
    }

    function getRankLevelDescription(priority) {
        var levels = _getRankLevels();
        var level = levels[priority];
        return level ? level.description : 'Custom rank level';
    }

    /**
     * Returns the SVG markup for a rank level icon.
     *
     * Delegates to window.getRankLevelIcon (icons.js). If icons.js is not
     * loaded, returns the empty string. Level icons are presentation; the
     * absence of icons.js is not a query failure.
     */
    function getRankLevelIcon(priority) {
        if (typeof window.getRankLevelIcon === 'function') {
            var icon = window.getRankLevelIcon(priority);
            return typeof icon === 'string' ? icon : '';
        }
        return '';
    }

    function getAvailableSymbols() {
        var symbols = window.AVAILABLE_SYMBOLS;
        if (Array.isArray(symbols) && symbols.length > 0) return symbols.slice();
        return ['⟡'];
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
        var currentYear = window.getCurrentYear();

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
     *
     * Returns { id, activeRankId } or null.
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

            // getParents may return { father, mother } or an array of edges.
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
