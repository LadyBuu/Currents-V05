/**
 * government-assignment.js
 * Compatibility façade. Real logic lives in GovernmentRules + GovernmentQueries.
 * Will be deleted once callers migrate.
 */
(function() {
    'use strict';

    var Rules = window.GovernmentRules;
    var Queries = window.GovernmentQueries;
    var _CharacterQueries = window.CharacterQueries;
    var _RoleQueries = window.RoleQueries;

    if (!Rules) throw new Error('government-assignment.js requires GovernmentRules');
    if (!Queries) throw new Error('government-assignment.js requires GovernmentQueries');
    if (!_CharacterQueries) throw new Error('government-assignment.js requires CharacterQueries');

    function _now() { return window.getCurrentYearSafe(); }

    // ---- Qualification -------------------------------------------------------

    function isCharacterQualifiedForPosition(characterId, departmentId, positionId) {
        var charFacts = _CharacterQueries.getCharacterFacts(characterId);
        if (!charFacts) return false;

        var position = Queries.getPosition(departmentId, positionId);
        if (!position) return false;

        // If the character is already assigned, they are not a valid candidate
        // for a new assignment to the same position.
        var existing = Queries.getAssignmentsForPosition(departmentId, positionId, { activeOnly: true });
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === characterId) return false;
        }

        var elig = Rules.checkPositionEligibility(charFacts, {
            requiredRoleId: position.requiredRoleId,
            minSkillLevel: position.minSkillLevel,
            genderRestriction: position.genderRestriction,
            requiredRankId: position.requiredRankId,
            minExperience: position.minExperience
        });
        return elig.eligible;
    }

    function getQualifiedCandidates(departmentId, positionId, options) {
        options = options || {};
        var limit = options.limit != null ? options.limit : null;

        var position = Queries.getPosition(departmentId, positionId);
        if (!position) return [];

        var positionFacts = {
            requiredRoleId: position.requiredRoleId,
            minSkillLevel: position.minSkillLevel,
            genderRestriction: position.genderRestriction,
            requiredRankId: position.requiredRankId,
            minExperience: position.minExperience
        };

        var existing = Queries.getAssignmentsForPosition(departmentId, positionId, { activeOnly: true });
        var assigned = {};
        for (var e = 0; e < existing.length; e++) assigned[existing[e].characterId] = true;

        var allFacts = _CharacterQueries.getAllCharacterFacts();
        var out = [];
        for (var i = 0; i < allFacts.length; i++) {
            var f = allFacts[i];
            if (f.isDeceased) continue;
            if (assigned[f.id]) continue;

            var elig = Rules.checkPositionEligibility(f, positionFacts);
            if (!elig.eligible) continue;

            var rankPriority = _rankPriorityOf(f.activeRankId);
            var score = Rules.scoreCandidate({
                age: f.age,
                experienceYears: f.experienceYears,
                rankPriority: rankPriority
            });

            out.push({
                characterId: f.id,
                characterName: f.fullName,
                age: f.age,
                experience: f.experienceYears || 0,
                rankId: f.activeRankId || null,
                rankName: f.activeRankId ? _rankNameOf(f.activeRankId) : null,
                skillLevel: position.requiredRoleId && f.skillLevels
                    ? f.skillLevels[position.requiredRoleId]
                    : null,
                score: score,
                isReady: Rules.isCandidateReady({
                    age: f.age,
                    experienceYears: f.experienceYears
                })
            });
        }

        out.sort(function(a, b) {
            return Rules.compareCandidates(
                { score: a.score, experienceYears: a.experience, age: a.age, characterId: a.characterId },
                { score: b.score, experienceYears: b.experience, age: b.age, characterId: b.characterId }
            );
        });

        if (limit != null && limit > 0) out = out.slice(0, limit);
        return out;
    }

    function _rankPriorityOf(rankId) {
        if (!rankId || !_RoleQueries || !_RoleQueries.getRankSummary) return null;
        var r = _RoleQueries.getRankSummary(rankId);
        return r && r.priority != null ? r.priority : null;
    }

    function _rankNameOf(rankId) {
        if (!rankId || !_RoleQueries || !_RoleQueries.getRankSummary) return null;
        var r = _RoleQueries.getRankSummary(rankId);
        return r ? r.name : null;
    }

    // ---- Succession ----------------------------------------------------------

    function getSuccessionPlan(departmentId, positionId) {
        var position = Queries.getPosition(departmentId, positionId);
        if (!position) return null;

        var currentAssignments = Queries.getAssignmentsForPosition(departmentId, positionId, { activeOnly: true });
        var currentHolder = currentAssignments.length > 0 ? {
            assignmentId: currentAssignments[0].id,
            characterId: currentAssignments[0].characterId,
            characterName: currentAssignments[0].characterName,
            startYear: currentAssignments[0].startYear,
            title: currentAssignments[0].title
        } : null;

        var candidates = getQualifiedCandidates(departmentId, positionId, { limit: 10 });

        return {
            positionId: positionId,
            positionName: position.name,
            departmentId: departmentId,
            currentHolder: currentHolder,
            candidates: candidates.map(function(c) {
                return {
                    characterId: c.characterId,
                    characterName: c.characterName,
                    age: c.age,
                    experience: c.experience,
                    rank: c.rankName,
                    isReady: c.isReady,
                    score: c.score
                };
            }),
            hasSuccessor: candidates.length > 0,
            successorCount: candidates.length,
            topCandidate: candidates.length > 0 ? {
                characterId: candidates[0].characterId,
                characterName: candidates[0].characterName
            } : null
        };
    }

    // ---- History analysis ----------------------------------------------------
    // Uses Queries.getAssignmentHistory so projections stay consistent with the
    // rest of the read layer.

    function analyzeAssignmentHistory(departmentId) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) return null;

        var assignments = Queries.getAssignmentsForDepartment(departmentId, { activeOnly: false });

        var analysis = {
            departmentId: departmentId,
            departmentName: dept.name,
            totalAssignments: assignments.length,
            activeAssignments: 0,
            endedAssignments: 0,
            averageTenure: 0,
            byPosition: {},
            byYear: {},
            byCharacter: {},
            longestServing: null,
            shortestServing: null,
            mostRecent: null
        };

        var totalTenure = 0;
        var tenureCount = 0;
        var currentYear = _now();

        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];

            if (a.isActive) analysis.activeAssignments++;
            else analysis.endedAssignments++;

            if (a.positionId) {
                analysis.byPosition[a.positionId] = (analysis.byPosition[a.positionId] || 0) + 1;
            }
            if (a.startYear != null) {
                analysis.byYear[a.startYear] = (analysis.byYear[a.startYear] || 0) + 1;
            }
            if (a.characterId) {
                analysis.byCharacter[a.characterId] = (analysis.byCharacter[a.characterId] || 0) + 1;
            }

            // Tenure aggregation: completed assignments only. Active assignments
            // are reported separately via activeAssignments.
            if (!a.isActive && a.startYear != null && a.endYear != null) {
                var tenure = a.endYear - a.startYear;
                if (tenure < 0) tenure = 0;
                totalTenure += tenure;
                tenureCount++;

                if (!analysis.longestServing || tenure > analysis.longestServing.tenure) {
                    analysis.longestServing = {
                        characterId: a.characterId,
                        characterName: a.characterName,
                        startYear: a.startYear,
                        endYear: a.endYear,
                        tenure: tenure,
                        positionId: a.positionId
                    };
                }
                if (!analysis.shortestServing || tenure < analysis.shortestServing.tenure) {
                    analysis.shortestServing = {
                        characterId: a.characterId,
                        characterName: a.characterName,
                        startYear: a.startYear,
                        endYear: a.endYear,
                        tenure: tenure,
                        positionId: a.positionId
                    };
                }
            }

            if (a.startYear != null) {
                if (!analysis.mostRecent || a.startYear > analysis.mostRecent.startYear) {
                    analysis.mostRecent = {
                        characterId: a.characterId,
                        characterName: a.characterName,
                        startYear: a.startYear,
                        positionId: a.positionId
                    };
                }
            }
        }

        analysis.averageTenure = tenureCount > 0
            ? Math.round((totalTenure / tenureCount) * 10) / 10
            : 0;
        analysis.referenceYear = currentYear;

        return analysis;
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentAssignment = {
        isCharacterQualifiedForPosition: isCharacterQualifiedForPosition,
        getQualifiedCandidates: getQualifiedCandidates,
        getSuccessionPlan: getSuccessionPlan,
        analyzeAssignmentHistory: analyzeAssignmentHistory
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentAssignment;
    }
})();
