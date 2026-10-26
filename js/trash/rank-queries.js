(function() {
    'use strict';

    function findRankByName(name) {
        if (!name || typeof name !== 'string') return null;
        var ranks = window.getRanks();
        var lower = name.toLowerCase();
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].name && ranks[i].name.toLowerCase() === lower) {
                return ranks[i];
            }
        }
        return null;
    }

    function getActiveRank(character) {
        if (!character || !Array.isArray(character.rankAssignments)) return null;
        var active = character.rankAssignments.filter(function(a) {
            return !a.isDeprecated;
        });
        if (active.length === 0) return null;

        var best = null;
        var bestPriority = Infinity;
        for (var i = 0; i < active.length; i++) {
            var rank = window.getRankById(active[i].rankId);
            if (!rank) continue;
            var priority = (typeof rank.priority === 'number') ? rank.priority : 3;
            if (priority < bestPriority) {
                bestPriority = priority;
                best = active[i];
            }
        }
        if (!best) return null;
        return window.getRankById(best.rankId);
    }

    function getActiveRankDisplay(character) {
        if (!character) return null;
        var rank = null;
        if (character.activeRankId) {
            rank = window.getRankById(character.activeRankId);
        }
        if (!rank) rank = getActiveRank(character);
        if (!rank) return null;
        return {
            id: rank.id,
            name: rank.name,
            priority: (typeof rank.priority === 'number') ? rank.priority : 3,
            symbol: rank.symbol || ''
        };
    }

    function getCharacterRanks(character) {
        if (!character || !Array.isArray(character.rankAssignments)) return [];
        var result = [];
        for (var i = 0; i < character.rankAssignments.length; i++) {
            var a = character.rankAssignments[i];
            if (a.isDeprecated) continue;
            var rank = window.getRankById(a.rankId);
            if (rank) {
                result.push({ rank: rank, number: a.number, order: a.order, assignedYear: a.assignedYear });
            }
        }
        result.sort(function(a, b) {
            var pa = (typeof a.rank.priority === 'number') ? a.rank.priority : 5;
            var pb = (typeof b.rank.priority === 'number') ? b.rank.priority : 5;
            return pa - pb;
        });
        return result;
    }

    function getAvailableRanksForCharacter(character) {
        if (!character) return [];
        var ranks = window.getRanks();
        var used = new Set();
        if (Array.isArray(character.rankAssignments)) {
            for (var i = 0; i < character.rankAssignments.length; i++) {
                if (!character.rankAssignments[i].isDeprecated) {
                    used.add(character.rankAssignments[i].rankId);
                }
            }
        }
        var result = [];
        for (var j = 0; j < ranks.length; j++) {
            var rank = ranks[j];
            if (used.has(rank.id)) continue;
            if (rank.isDeprecated) continue;
            if (rank.genderRestriction && rank.genderRestriction !== 'either') {
                if (character.gender !== rank.genderRestriction) continue;
            }
            result.push(rank);
        }
        return result;
    }

    window.findRankByName = findRankByName;
    window.getActiveRank = getActiveRank;
    window.getActiveRankDisplay = getActiveRankDisplay;
    window.getCharacterRanks = getCharacterRanks;
    window.getAvailableRanksForCharacter = getAvailableRanksForCharacter;
})();
