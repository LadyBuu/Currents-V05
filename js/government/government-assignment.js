/**
 * =============================================================================
 * GOVERNMENT ASSIGNMENT - Business logic for government assignments * =============================================================================
 * 
 * This file contains business logic for:
 * - Assignment validation and qualification checking
 * - Succession planning and heir identification
 * - Assignment history analysis
 * - Candidate scoring and ranking
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - government-queries.js (GovernmentQueries)
 *   - accessors.js (getCharacterById, getCharacters, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingAssignment = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getRankById(id) {
        if (typeof window.getRankById === 'function') {
            return window.getRankById(id);
        }
        return null;
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. QUALIFICATION CHECKS
    // =========================================================================

    function isCharacterQualifiedForPosition(characterId, departmentId, positionId) {
        if (_processingAssignment) {
            console.warn('Assignment processing already running, skipping');
            return false;
        }
        _processingAssignment = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character || character.isDeceased) return false;

            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) return false;

            // Check age (minimum 18)
            var age = _calculateAge(character.birthYear, false, null);
            if (age < 18) return false;

            // Check if already assigned to this position
            var existing = GovernmentState.getAssignmentsForPosition(departmentId, positionId, true);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].characterId === characterId) return false;
            }

            // Check rank requirements (if any)
            if (position.requiredRankId && character.activeRankId !== position.requiredRankId) {
                return false;
            }

            // Check skill/experience requirements (if any)
            if (position.minExperience && character.experienceYears < position.minExperience) {
                return false;
            }

            // Check gender restrictions (if any)
            if (position.genderRestriction && position.genderRestriction !== 'either') {
                if (character.gender !== position.genderRestriction) return false;
            }

            return true;

        } finally {
            _processingAssignment = false;
        }
    }

    function getQualifiedCandidates(departmentId, positionId, options) {
        if (_processingAssignment) {
            console.warn('Assignment processing already running, skipping');
            return [];
        }
        _processingAssignment = true;

        try {
            options = options || {};

            var allChars = _getCharacters();
            var qualified = [];

            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;

                var isQualified = isCharacterQualifiedForPosition(char.id, departmentId, positionId);
                if (isQualified) {
                    var age = _calculateAge(char.birthYear, false, null);
                    var experience = char.experienceYears || 0;
                    var rank = char.activeRankId ? _getRankById(char.activeRankId) : null;

                    // Calculate qualification score
                    var score = 0;
                    if (rank) {
                        var rankPriority = rank.priority || 5;
                        score += (6 - rankPriority) * 10;
                    }
                    score += Math.min(experience, 20) * 2;
                    if (age >= 30 && age <= 50) score += 20;
                    if (age >= 25 && age <= 55) score += 10;

                    qualified.push({
                        character: char,
                        age: age,
                        experience: experience,
                        rank: rank,
                        score: Math.min(100, score),
                        isReady: age >= 25 && experience >= 5
                    });
                }
            }

            // Sort by score
            qualified.sort(function(a, b) {
                return b.score - a.score;
            });

            if (options.limit) {
                qualified = qualified.slice(0, options.limit);
            }

            return qualified;

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 4. SUCCESSION PLANNING
    // =========================================================================

    function getSuccessionPlan(departmentId, positionId) {
        if (_processingAssignment) {
            console.warn('Assignment processing already running, skipping');
            return null;
        }
        _processingAssignment = true;

        try {
            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) return null;

            var currentAssignments = GovernmentState.getAssignmentsForPosition(departmentId, positionId, true);
            var currentHolder = currentAssignments.length > 0 ? currentAssignments[0] : null;

            var candidates = getQualifiedCandidates(departmentId, positionId, { limit: 10 });

            return {
                positionId: positionId,
                positionName: position.name,
                departmentId: departmentId,
                currentHolder: currentHolder ? {
                    characterId: currentHolder.characterId,
                    characterName: currentHolder.characterName,
                    startYear: currentHolder.startYear,
                    title: currentHolder.title
                } : null,
                candidates: candidates.map(function(c) {
                    return {
                        characterId: c.character.id,
                        characterName: c.character.name + (c.character.surname ? ' ' + c.character.surname : ''),
                        age: c.age,
                        experience: c.experience,
                        rank: c.rank ? c.rank.name : null,
                        isReady: c.isReady,
                        score: c.score
                    };
                }),
                hasSuccessor: candidates.length > 0,
                successorCount: candidates.length,
                topCandidate: candidates.length > 0 ? {
                    characterId: candidates[0].character.id,
                    characterName: candidates[0].character.name + (candidates[0].character.surname ? ' ' + candidates[0].character.surname : '')
                } : null
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 5. ASSIGNMENT HISTORY ANALYSIS
    // =========================================================================

    function analyzeAssignmentHistory(departmentId) {
        if (_processingAssignment) {
            console.warn('Assignment processing already running, skipping');
            return null;
        }
        _processingAssignment = true;

        try {
            var assignments = GovernmentState.getAssignmentsForDepartment(departmentId, false);
            var dept = GovernmentState.getDepartment(departmentId);

            if (!dept) return null;

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
                mostRecent: null,
                shortestServing: null
            };

            var totalTenure = 0;
            var tenureCount = 0;

            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                var isActive = !a.endYear;

                if (isActive) {
                    analysis.activeAssignments++;
                } else {
                    analysis.endedAssignments++;
                }

                // By position
                if (a.positionId) {
                    if (!analysis.byPosition[a.positionId]) {
                        analysis.byPosition[a.positionId] = 0;
                    }
                    analysis.byPosition[a.positionId]++;
                }

                // By year
                var year = a.startYear || 0;
                if (!analysis.byYear[year]) {
                    analysis.byYear[year] = 0;
                }
                analysis.byYear[year]++;

                // By character
                if (a.characterId) {
                    if (!analysis.byCharacter[a.characterId]) {
                        analysis.byCharacter[a.characterId] = 0;
                    }
                    analysis.byCharacter[a.characterId]++;
                }

                // Tenure
                if (a.endYear) {
                    var tenure = a.endYear - a.startYear;
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

                // Most recent
                if (!analysis.mostRecent || (a.startYear || 0) > (analysis.mostRecent.startYear || 0)) {
                    analysis.mostRecent = {
                        characterId: a.characterId,
                        characterName: a.characterName,
                        startYear: a.startYear,
                        positionId: a.positionId
                    };
                }
            }

            analysis.averageTenure = tenureCount > 0 ? Math.round((totalTenure / tenureCount) * 10) / 10 : 0;

            return analysis;

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.GovernmentAssignment = {
        // Qualification
        isCharacterQualifiedForPosition: isCharacterQualifiedForPosition,
        getQualifiedCandidates: getQualifiedCandidates,

        // Succession
        getSuccessionPlan: getSuccessionPlan,

        // History analysis
        analyzeAssignmentHistory: analyzeAssignmentHistory
    };

})();