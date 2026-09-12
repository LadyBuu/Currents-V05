/**
 * =============================================================================
 * STILL WATERS - RANK QUERIES (rank-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/core/rank/rank-queries.js
 * 
 * This file contains ALL read operations for ranks.
 * 
 * EXPORTED FUNCTIONS:
 *   - RankQueries.getRank(id)
 *   - RankQueries.getAllRanks()
 *   - RankQueries.getRanksByPriority(priority)
 *   - RankQueries.getRankHierarchy()
 *   - RankQueries.getRankLevelName(priority)
 *   - RankQueries.getRankLevelIcon(priority)
 *   - RankQueries.getRankLevelDescription(priority)
 *   - RankQueries.getInheritanceRules()
 *   - RankQueries.getInheritanceRulesForRank(rankId)
 *   - RankQueries.getCharactersWithRank(rankId, includeDeprecated)
 *   - RankQueries.getRankHolderCount(rankId, includeDeprecated)
 *   - RankQueries.getRankHolderStats(rankId)
 *   - RankQueries.getRanksWithSurnameRules()
 *   - RankQueries.getRankSurnameRule(rankId)
 *   - RankQueries.getSpouseInheritanceRanks(characterId)
 * 
 * DEPENDENCIES:
 *   - rank-state.js: RankState
 *   - rank-constants.js: RANK_LEVELS, AVAILABLE_SYMBOLS
 *   - accessors.js: getCharacterById, getCharacters
 *   - time.js: getCurrentYearSafe, calculateAge
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

    function _getRankLevels() {
        return window.RANK_LEVELS || {
            1: { name: "Sovereign", icon: "◉", description: "Highest level" },
            2: { name: "High Noble", icon: "◧", description: "Dukes, princes" },
            3: { name: "Noble", icon: "◈", description: "Counts, earls" },
            4: { name: "Gentry", icon: "⟡", description: "Knights" },
            5: { name: "Commoner", icon: "⌂", description: "Common people" }
        };
    }

    function _getAvailableSymbols() {
        return window.AVAILABLE_SYMBOLS || [
            '◉', '◧', '◈', '⟡', '⌂', '✦', '✧', '✪', '✴', '✺'
        ];
    }

    // =========================================================================
    // 2. RANK QUERIES (Wrappers around RankState)
    // =========================================================================

    function getRank(rankId) {
        return window.RankState.getRank(rankId);
    }

    function getAllRanks() {
        return window.RankState.getAllRanks();
    }

    function getRanksByPriority(priority) {
        return window.RankState.getRanksByPriority(priority);
    }

    function getRankHierarchy() {
        return window.RankState.getRankHierarchy();
    }

    function getInheritanceRules() {
        return window.RankState.getInheritanceRules();
    }

    function getInheritanceRulesForRank(rankId) {
        return window.RankState.getInheritanceRulesForRank(rankId);
    }

    function getRankCount() {
        return window.RankState.getRankCount();
    }

    // =========================================================================
    // 3. RANK LEVEL HELPERS
    // =========================================================================

    function getRankLevelName(priority) {
        var levels = _getRankLevels();
        var level = levels[priority];
        return level ? level.name : 'Level ' + priority;
    }

    function getRankLevelIcon(priority) {
        var levels = _getRankLevels();
        var level = levels[priority];
        return level ? level.icon : '⌂';
    }

    function getRankLevelDescription(priority) {
        var levels = _getRankLevels();
        var level = levels[priority];
        return level ? level.description : 'Custom rank level';
    }

    function getAvailableSymbols() {
        return _getAvailableSymbols();
    }

    // =========================================================================
    // 4. CHARACTER RANK QUERIES
    // =========================================================================

    function getCharactersWithRank(rankId, includeDeprecated) {
        includeDeprecated = includeDeprecated || false;
        var characters = _getCharacters();
        var result = [];

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            var hasActiveRank = c.activeRankId === rankId;
            var hasAssignment = c.rankAssignments && c.rankAssignments.some(function(ra) {
                return ra.rankId === rankId && (includeDeprecated || !ra.isDeprecated);
            });
            if (hasActiveRank || hasAssignment) {
                result.push(c);
            }
        }
        return result;
    }

    function getRankHolderCount(rankId, includeDeprecated) {
        return getCharactersWithRank(rankId, includeDeprecated).length;
    }

    function getRankHolderStats(rankId) {
        var holders = getCharactersWithRank(rankId, false);
        var currentYear = _getCurrentYear();

        var maleCount = 0;
        var femaleCount = 0;
        var livingCount = 0;
        var deceasedCount = 0;
        var minors = 0;
        var adults = 0;
        var elders = 0;

        for (var i = 0; i < holders.length; i++) {
            var c = holders[i];
            if (c.gender === 'male') maleCount++;
            else if (c.gender === 'female') femaleCount++;
            if (c.isDeceased) deceasedCount++;
            else livingCount++;

            var age = _calculateAge(c.birthYear, c.isDeceased, c.deathYear);
            if (age < 18) minors++;
            else if (age < 60) adults++;
            else elders++;
        }

        return {
            total: holders.length,
            male: maleCount,
            female: femaleCount,
            living: livingCount,
            deceased: deceasedCount,
            minors: minors,
            adults: adults,
            elders: elders
        };
    }

    // =========================================================================
    // 5. SURNAME RULE QUERIES
    // =========================================================================

    function getRanksWithSurnameRules() {
        var ranks = getAllRanks();
        var result = [];
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].customSurnameRule === true) {
                result.push(ranks[i]);
            }
        }
        return result;
    }

    function getRankSurnameRule(rankId) {
        var rank = getRank(rankId);
        if (!rank || !rank.customSurnameRule) return null;

        return {
            enabled: true,
            connector: rank.surnameConnector || 'of',
            prefix: rank.surnamePrefix || '',
            suffix: rank.surnameSuffix || ''
        };
    }

    // =========================================================================
    // 6. SPOUSE INHERITANCE QUERIES
    // =========================================================================

    function getSpouseInheritanceRanks(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return [];

        // Find spouse
        var spouse = null;
        if (character.relationships) {
            for (var i = 0; i < character.relationships.length; i++) {
                var rel = character.relationships[i];
                if (rel.status === 'ongoing') {
                    spouse = _getCharacterById(rel.partnerId);
                    if (spouse) break;
                }
            }
        }

        if (!spouse || !spouse.activeRankId) return [];

        var spouseRank = getRank(spouse.activeRankId);
        if (!spouseRank || !spouseRank.spouseInheritance) return [];

        var inheritedRank = getRank(spouseRank.spouseInheritance);
        return inheritedRank ? [inheritedRank] : [];
    }

    // =========================================================================
    // 7. VALIDATION HELPERS
    // =========================================================================

    function isValidRank(rank) {
        if (!rank || !rank.id) return false;
        if (!rank.name || rank.name.trim() === '') return false;
        if (rank.priority && (rank.priority < 1 || rank.priority > 10)) return false;
        return true;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RankQueries = {
        // Rank queries
        getRank: getRank,
        getAllRanks: getAllRanks,
        getRanksByPriority: getRanksByPriority,
        getRankHierarchy: getRankHierarchy,
        getInheritanceRules: getInheritanceRules,
        getInheritanceRulesForRank: getInheritanceRulesForRank,
        getRankCount: getRankCount,

        // Level helpers
        getRankLevelName: getRankLevelName,
        getRankLevelIcon: getRankLevelIcon,
        getRankLevelDescription: getRankLevelDescription,
        getAvailableSymbols: getAvailableSymbols,

        // Character rank queries
        getCharactersWithRank: getCharactersWithRank,
        getRankHolderCount: getRankHolderCount,
        getRankHolderStats: getRankHolderStats,

        // Surname rules
        getRanksWithSurnameRules: getRanksWithSurnameRules,
        getRankSurnameRule: getRankSurnameRule,

        // Spouse inheritance
        getSpouseInheritanceRanks: getSpouseInheritanceRanks,

        // Validation
        isValidRank: isValidRank
    };

    // Legacy aliases
    window._rankQueries = window.RankQueries;

})();