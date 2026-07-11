/**
 * =============================================================================
 * STILL WATERS - MORTALITY QUERIES (js/core/mortality/mortality-queries.js)
 * =============================================================================
 * 
 * All read operations for mortality data.
 * - NO side effects
 * - NO mutations
 * - Pure queries
 * 
 * DEPENDENCIES:
 *   - mortality-state.js (MortalityState)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - family-logic.js (getChildren)
 *   - romance-logic.js (getActiveRomanticRelationships)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.MortalityState !== 'undefined' ? window.MortalityState : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
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

    function _getChildren(characterId) {
        if (typeof window.FamilyLogic !== 'undefined') {
            return window.FamilyLogic.getChildren(characterId);
        }
        if (typeof window.getChildren === 'function') {
            return window.getChildren(characterId);
        }
        return [];
    }

    function _getActiveRomanticRelationships(characterId) {
        if (typeof window.RomanceLogic !== 'undefined') {
            return window.RomanceLogic.getActiveRomanticRelationships(characterId);
        }
        if (typeof window.getActiveRomanticRelationships === 'function') {
            return window.getActiveRomanticRelationships(characterId);
        }
        return [];
    }

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        return 'Unknown';
    }

    function _getActiveRankDisplay(character) {
        if (typeof window.getActiveRankDisplay === 'function') {
            return window.getActiveRankDisplay(character);
        }
        return null;
    }

    function _getCharacterHousehold(characterId) {
        if (typeof window.getCharacterHousehold === 'function') {
            return window.getCharacterHousehold(characterId);
        }
        return null;
    }

    function _getAllHouseholds() {
        if (typeof window.getAllHouseholds === 'function') {
            return window.getAllHouseholds();
        }
        return [];
    }

    // =========================================================================
    // 3. CHARACTER STATISTICS QUERIES (FROM OLD mortality.js)
    // =========================================================================

    function getCharacterLastChildBirthYear(character) {
        if (_processing) return null;
        _processing = true;

        try {
            if (!character) return null;

            var children = _getChildren(character.id);
            if (children.length === 0) return null;

            var youngestYear = null;
            for (var i = 0; i < children.length; i++) {
                if (children[i].birthYear && (youngestYear === null || children[i].birthYear > youngestYear)) {
                    youngestYear = children[i].birthYear;
                }
            }
            return youngestYear;

        } finally {
            _processing = false;
        }
    }

    function getCharacterRelationshipCount(character) {
        if (_processing) return 0;
        _processing = true;

        try {
            if (!character) return 0;

            var activeRels = _getActiveRomanticRelationships(character.id);
            return activeRels.length;

        } finally {
            _processing = false;
        }
    }

    function getCharacterTotalChildren(character) {
        if (_processing) return 0;
        _processing = true;

        try {
            if (!character) return 0;

            var children = _getChildren(character.id);
            var adoptedChildren = 0;

            if (typeof window.getAdoptedChildren === 'function') {
                adoptedChildren = window.getAdoptedChildren(character.id).length;
            }

            return children.length + adoptedChildren;

        } finally {
            _processing = false;
        }
    }

    function getCharacterRelationshipSummary(character) {
        if (_processing) return 'None';
        _processing = true;

        try {
            if (!character) return 'None';

            var activeRels = _getActiveRomanticRelationships(character.id);

            if (activeRels.length === 0) return 'Single';

            var isMarried = false;
            for (var i = 0; i < activeRels.length; i++) {
                var attrs = activeRels[i].metadata?.attributes || [];
                if (attrs.indexOf('married') !== -1) {
                    isMarried = true;
                    break;
                }
            }

            if (isMarried) return '♡ Married';
            if (activeRels.length === 1) return '♡ Partnered';
            return '♡ ' + activeRels.length + ' partners';

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. DEATH STATISTICS QUERIES
    // =========================================================================

    function getMortalityStatistics() {
        if (_processing) return null;
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { totalDeaths: 0, totalMurders: 0, totalExecutions: 0 };
            }

            var deathRecords = state.getAllDeathRecords();
            var murderRecords = state.getMurderRecords();
            var executionRecords = state.getExecutionRecords();
            var living = state.getLivingCharacters();

            var byCause = {};
            var byYear = {};
            var byAgeGroup = {};
            var byGender = {};

            var ageGroups = {
                '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0,
                '41-50': 0, '51-60': 0, '61-70': 0, '71-80': 0,
                '81-90': 0, '91+': 0
            };

            for (var i = 0; i < deathRecords.length; i++) {
                var record = deathRecords[i];
                var character = _getCharacterById(record.characterId);
                if (!character) continue;

                var cause = record.deathCause || 'Unknown';
                var causeKey = cause.split(':')[0].trim() || 'Unknown';
                byCause[causeKey] = (byCause[causeKey] || 0) + 1;

                var year = record.deathYear || 'Unknown';
                byYear[year] = (byYear[year] || 0) + 1;

                var age = record.ageAtDeath || 0;
                var group = '91+';
                var groups = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90'];
                for (var g = 0; g < groups.length; g++) {
                    var parts = groups[g].split('-');
                    var min = parseInt(parts[0]);
                    var max = parseInt(parts[1]);
                    if (age >= min && age <= max) {
                        group = groups[g];
                        break;
                    }
                }
                byAgeGroup[group] = (byAgeGroup[group] || 0) + 1;

                var gender = character.gender || 'unknown';
                byGender[gender] = (byGender[gender] || 0) + 1;
            }

            return {
                totalDeaths: deathRecords.length,
                totalMurders: murderRecords.length,
                totalExecutions: executionRecords.length,
                livingCount: living.length,
                byCause: byCause,
                byYear: byYear,
                byAgeGroup: byAgeGroup,
                byGender: byGender,
                murderRate: living.length > 0 ? (murderRecords.length / (living.length + deathRecords.length)) * 100 : 0,
                executionRate: living.length > 0 ? (executionRecords.length / (living.length + deathRecords.length)) * 100 : 0
            };

        } finally {
            _processing = false;
        }
    }

    function getMurderStatistics() {
        if (_processing) return null;
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { totalMurders: 0, byMotive: {}, byMethod: {}, byYear: {} };
            }

            var murderRecords = state.getMurderRecords();
            var byMotive = {};
            var byMethod = {};
            var byYear = {};

            for (var i = 0; i < murderRecords.length; i++) {
                var record = murderRecords[i];
                var motive = record.motive || 'Unknown';
                var method = record.method || 'Unknown';
                var year = record.year || 'Unknown';

                byMotive[motive] = (byMotive[motive] || 0) + 1;
                byMethod[method] = (byMethod[method] || 0) + 1;
                byYear[year] = (byYear[year] || 0) + 1;
            }

            return {
                totalMurders: murderRecords.length,
                byMotive: byMotive,
                byMethod: byMethod,
                byYear: byYear
            };

        } finally {
            _processing = false;
        }
    }

    function getExecutionStatistics() {
        if (_processing) return null;
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { totalExecutions: 0, byReason: {}, byMethod: {}, byYear: {} };
            }

            var executionRecords = state.getExecutionRecords();
            var byReason = {};
            var byMethod = {};
            var byYear = {};

            for (var i = 0; i < executionRecords.length; i++) {
                var record = executionRecords[i];
                var reason = record.reason || 'Unknown';
                var method = record.method || 'Unknown';
                var year = record.year || 'Unknown';

                byReason[reason] = (byReason[reason] || 0) + 1;
                byMethod[method] = (byMethod[method] || 0) + 1;
                byYear[year] = (byYear[year] || 0) + 1;
            }

            return {
                totalExecutions: executionRecords.length,
                byReason: byReason,
                byMethod: byMethod,
                byYear: byYear
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.MortalityQueries = {
        // Character statistics (from old mortality.js)
        getCharacterLastChildBirthYear: getCharacterLastChildBirthYear,
        getCharacterRelationshipCount: getCharacterRelationshipCount,
        getCharacterTotalChildren: getCharacterTotalChildren,
        getCharacterRelationshipSummary: getCharacterRelationshipSummary,

        // Death statistics
        getMortalityStatistics: getMortalityStatistics,
        getMurderStatistics: getMurderStatistics,
        getExecutionStatistics: getExecutionStatistics
    };

    // Legacy aliases
    window.getCharacterLastChildBirthYear = getCharacterLastChildBirthYear;
    window.getCharacterRelationshipCount = getCharacterRelationshipCount;
    window.getCharacterTotalChildren = getCharacterTotalChildren;
    window.getCharacterRelationshipSummary = getCharacterRelationshipSummary;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.MortalityQueries;
    }

})();